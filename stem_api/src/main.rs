//! Stem split API: hybrid pipeline. Rust orchestrates Stage1 (Python) → phase inversion (Rust) → Stage2 (Python).

use axum::{
    extract::Multipart,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};
use tower_http::services::ServeDir;
use uuid::Uuid;

mod phase_inversion;

use phase_inversion::create_perfect_instrumental;

#[derive(Clone)]
struct AppState {
    repo_root: PathBuf,
    output_base: PathBuf,
    python: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    repo_root: String,
}

#[derive(Serialize)]
struct SplitResponse {
    job_id: String,
    status: &'static str,
    stems: Vec<StemRef>,
}

#[derive(Serialize)]
struct StemRef {
    id: String,
    path: String,
}

#[derive(Deserialize)]
struct Stage1Output {
    vocals_path: String,
}

#[derive(Deserialize)]
struct Stage2Output {
    stems: Vec<StemRef>,
}

fn read_json<T: for<'de> Deserialize<'de>>(raw: &[u8]) -> Result<T, String> {
    serde_json::from_slice(raw).map_err(|e| e.to_string())
}

async fn health(state: axum::extract::State<Arc<AppState>>) -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        repo_root: state.repo_root.to_string_lossy().to_string(),
    })
}

async fn split(
    state: axum::extract::State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let job_id = Uuid::new_v4().to_string();
    let job_dir = state.output_base.join(&job_id);
    if let Err(e) = std::fs::create_dir_all(&job_dir) {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    let mut input_path: Option<PathBuf> = None;
    let mut stems_param = 4u32;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            let filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "input.wav".to_string());
            let path = job_dir.join(&filename);
            if let Ok(data) = field.bytes().await {
                if let Err(e) = std::fs::write(&path, &data) {
                    return (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": e.to_string() })),
                    )
                        .into_response();
                }
                input_path = Some(path);
            }
        } else if name == "stems" {
            if let Ok(Some(text)) = field.text().await {
                stems_param = text.trim().parse().unwrap_or(4);
                if stems_param != 2 && stems_param != 4 {
                    stems_param = 4;
                }
            }
        }
    }

    let input_path = match input_path {
        Some(p) => p,
        None => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "missing file" })),
            )
                .into_response()
        }
    };

    let python = state.python.as_str();
    let repo_root = state.repo_root.clone();
    let out_dir = job_dir.clone();
    let output_base = state.output_base.clone();

    // Stage 1: vocals only
    let stage1 = Command::new(python)
        .current_dir(&repo_root)
        .env("PYTHONPATH", repo_root.join("stem_service").parent().unwrap_or(&repo_root))
        .args([
            "-m",
            "stem_service.hybrid",
            "stage1",
            input_path.to_str().unwrap(),
            "--out-dir",
            out_dir.to_str().unwrap(),
        ])
        .output();

    let stage1_output = match stage1 {
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage1 exec: {}", e) })),
            )
                .into_response()
        }
        Ok(o) if !o.status.success() => {
            let err = String::from_utf8_lossy(&o.stderr);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage1: {}", err) })),
            )
                .into_response();
        }
        Ok(o) => o.stdout,
    };

    let stage1_json: Stage1Output = match read_json(&stage1_output) {
        Ok(j) => j,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage1 parse: {}", e) })),
            )
                .into_response();
        }
    };

    let vocals_path = PathBuf::from(&stage1_json.vocals_path);
    let instrumental_path = job_dir.join("instrumental.wav");

    // Phase inversion (Rust)
    if let Err(e) = create_perfect_instrumental(&input_path, &vocals_path, &instrumental_path) {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("phase inversion: {:?}", e) })),
        )
            .into_response();
    }

    if stems_param == 2 {
        let stems_dir = job_dir.join("stems");
        std::fs::create_dir_all(&stems_dir).map_err(|e| {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to create stems dir: {}", e) })),
            )
                .into_response();
        })?;
        let dest_vocals = stems_dir.join("vocals.wav");
        let dest_inst = stems_dir.join("instrumental.wav");
        std::fs::copy(&vocals_path, &dest_vocals).map_err(|e| {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to copy vocals: {}", e) })),
            )
                .into_response();
        })?;
        std::fs::copy(&instrumental_path, &dest_inst).map_err(|e| {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to copy instrumental: {}", e) })),
            )
                .into_response();
        })?;
        let stems = vec![
            StemRef {
                id: "vocals".to_string(),
                path: format!("{}/stems/vocals.wav", job_id),
            },
            StemRef {
                id: "instrumental".to_string(),
                path: format!("{}/stems/instrumental.wav", job_id),
            },
        ];
        return (
            axum::http::StatusCode::OK,
            Json(SplitResponse {
                job_id,
                status: "completed",
                stems,
            }),
        )
            .into_response();
    }

    // Stage 2: Demucs on instrumental
    let stage2 = Command::new(python)
        .current_dir(&repo_root)
        .env("PYTHONPATH", repo_root.join("stem_service").parent().unwrap_or(&repo_root))
        .args([
            "-m",
            "stem_service.hybrid",
            "stage2",
            instrumental_path.to_str().unwrap(),
            "--out-dir",
            out_dir.to_str().unwrap(),
        ])
        .output();

    let stage2_output = match stage2 {
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage2 exec: {}", e) })),
            )
                .into_response()
        }
        Ok(o) if !o.status.success() => {
            let err = String::from_utf8_lossy(&o.stderr);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage2: {}", err) })),
            )
                .into_response();
        }
        Ok(o) => o.stdout,
    };

    let stage2_json: Stage2Output = match read_json(&stage2_output) {
        Ok(j) => j,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("stage2 parse: {}", e) })),
            )
                .into_response();
        }
    };

    // Copy Stage 1 vocals into stems dir so we have all four
    let stems_dir = job_dir.join("stems");
    std::fs::create_dir_all(&stems_dir).map_err(|e| {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to create stems dir: {}", e) })),
        )
            .into_response();
    })?;
    let dest_vocals = stems_dir.join("vocals.wav");
    std::fs::copy(&vocals_path, &dest_vocals).map_err(|e| {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to copy vocals: {}", e) })),
        )
            .into_response();
    })?;

    let mut stems = vec![StemRef {
        id: "vocals".to_string(),
        path: format!("{}/stems/vocals.wav", job_id),
    }];
    for s in &stage2_json.stems {
        stems.push(StemRef {
            id: s.id.clone(),
            path: format!("{}/{}", job_id, s.path.replace('\\', "/")),
        });
    }

    (
        axum::http::StatusCode::OK,
        Json(SplitResponse {
            job_id,
            status: "completed",
            stems,
        }),
    )
        .into_response()
}

#[tokio::main]
async fn main() {
    let repo_root: PathBuf = std::env::var("REPO_ROOT")
        .unwrap_or_else(|_| ".".to_string())
        .into();
    let output_base: PathBuf = std::env::var("STEM_OUTPUT_DIR")
        .unwrap_or_else(|_| {
            repo_root
                .join("tmp")
                .join("stems")
                .to_string_lossy()
                .to_string()
        })
        .into();
    let python = std::env::var("PYTHON").unwrap_or_else(|_| "python3".to_string());

    let _ = std::fs::create_dir_all(&output_base);

    let state = Arc::new(AppState {
        repo_root: repo_root.clone(),
        output_base: output_base.clone(),
        python,
    });

    let serve_stems = ServeDir::new(&output_base);
    let frontend_origins: Vec<&str> = std::env::var("FRONTEND_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173,http://localhost:3000".to_string())
        .split(',')
        .collect();
    
    let cors = CorsLayer::new()
        .allow_origin(frontend_origins.iter().map(|s| s.parse().unwrap()).collect::<Vec<_>>())
        .allow_credentials(true)
        .allow_methods(Any)
        .allow_headers(Any);
    
    let app = Router::new()
        .route("/health", get(health))
        .route("/split", post(split))
        .nest_service("/files", serve_stems)
        .layer(cors)
        .with_state(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 5000));
    println!("Stem API (hybrid) at http://{}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}
