Yes — a few things in **[hybrid.py](https://onedrive.live.com?cid=A190C8D0C0881F11\&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f\&EntityRepresentationId=fe0ca139-f929-46fa-99ca-3e81c5f661ca)** look like they’re very likely to **break at runtime** (or behave incorrectly) as written. Here are the biggest “will not function correctly” issues I see, plus why they matter and how to fix them. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

***

## 1) `run_4stem_single_pass_or_hybrid()` can fall off the end and return **None**

In **`run_4stem_single_pass_or_hybrid()`**, you try SCNet first, and if it fails you log a warning… but you **don’t actually call the Demucs/hybrid fallback** in that branch. That means the function can exit without returning anything (implicitly returning `None`), even though the type hint says it returns a tuple. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

### Where it happens

The control flow is:

*   If VAD chunking works → returns chunked result ✅
*   Else if SCNet available and enabled → try SCNet
    *   If SCNet succeeds → return ✅
    *   If SCNet fails → warning logged ❌ **but no return after**
*   Else if SCNet configured but disabled → warning logged ❌ **but no return after**
*   Else if skipping SCNet → returns hybrid ✅

So if SCNet is attempted and fails (or is disabled by self-test), you currently do **not** return a fallback. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

### Fix

After the SCNet attempt (and after the “configured but disabled” warning), you need to fall back to the hybrid path, e.g.:

```python
# after SCNet failure or disable
_log.info("4-stem: using hybrid pipeline (Stage 1 + PyTorch Demucs subprocess)")
return run_hybrid_4stem(...)
```

***

## 2) `main()` “full” command: wrong unpacking + wrong payload building (will raise exceptions)

In the `"full"` command section, you do:

```python
if args.stems == 2:
    stem_list = run_hybrid_2stem(args.input, args.out_dir)
else:
    stem_list = run_hybrid_4stem(args.input, args.out_dir)

payload = {
  "stems": [
    {"id": stem_id, "path": str(p[1].relative_to(out_base))}
    for stem_id, p in stem_list
  ],
}
```

There are **two separate problems** here:

### 2a) `run_hybrid_2stem()` and `run_hybrid_4stem()` return **(stem\_list, models\_used)**, not just `stem_list`

Both functions return a **tuple** of `(list_of_stems, list_of_models)`:

*   `run_hybrid_4stem(...) -> tuple[list[tuple[str, Path]], list[str]]` [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)
*   `run_hybrid_2stem(...) -> tuple[list[tuple[str, Path]], list[str]]` [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

So in `main()`, `stem_list` becomes a 2-tuple like `([("vocals", Path(...)), ...], ["htdemucs"])`.

Then your list comprehension tries: `for stem_id, p in stem_list` — but iterating that 2-tuple yields:

1.  the **list of stems** (not a `(stem_id, p)` pair)
2.  the **models\_used list** (also not a `(stem_id, p)` pair)

That will typically blow up with a `ValueError: too many values to unpack` or similar. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

### 2b) You treat `p` as indexable (`p[1]`) even though it’s already a `Path`

Even if you had unpacked correctly, each stem entry is `(stem_id, Path)` so the second item is already a `Path`. Your code does `p[1].relative_to(...)`, which would error because `Path` is not subscriptable. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

### Fix

Properly unpack return values and build payload like this:

```python
stems, models_used = run_hybrid_2stem(...)  # or run_hybrid_4stem(...)
payload = {
    "stems": [{"id": sid, "path": str(path.relative_to(out_base))} for sid, path in stems],
    "models_used": models_used,
}
```

That also makes your JSON output more useful.

***

## 3) Several type annotations are malformed (likely a **syntax error**)

There are multiple function signatures that contain things like:

*   `use_vad_trim: bool \ None = None,` [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)
*   `progress_callback: Callable[[int], None] \ None = None,` [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)
*   `job_logger: "logging.Logger \ None" = None,` [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

In Python typing, that should be `bool | None` (Python 3.10+) or `Optional[bool]`. The **backslash** you have (`\`) is not valid typing syntax and is extremely likely to cause a **SyntaxError** (or at best be interpreted as a line-continuation in the wrong place, depending on exact characters). [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

### Fix

Use proper unions:

```python
use_vad_trim: bool | None = None
progress_callback: Callable[[int], None] | None = None
job_logger: logging.Logger | None = None
```

Or use `Optional[...]` from `typing`.

***

## 4) `main()` uses the wrong API shape for `run_hybrid_*` (in multiple places)

Even beyond the `"full"` command, your `main()` assumes `run_hybrid_*` returns only stems. But both return `(stems, models_used)`.   
So **any** place you treat the return as a plain list of stems will misbehave. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

***

## 5) Logic mismatch: `_effective_input_path()` ignores the function argument in one important case

`_effective_input_path()` accepts `use_vad_trim` but the first check is:

```python
if not USE_VAD_PRETRIM:
    return input_path
```

That means even if you explicitly call `_effective_input_path(..., use_vad_trim=True)`, it will still refuse to trim unless the global `USE_VAD_PRETRIM` is enabled. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

That might be intentional, but the docstring says:

*   “use\_vad\_trim: True = trim when VAD available; False = never trim; None = follow USE\_VAD\_PRETRIM env.” [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

Given that docstring, **explicit True** should probably override the env flag, not be blocked by it.

### Fix (if you intended override behavior)

Reorder logic:

```python
if use_vad_trim is False:
    return input_path
if use_vad_trim is None and not USE_VAD_PRETRIM:
    return input_path
...
```

***

## 6) Potential sample-rate/length assumptions in `_concat_stems()`

In `_concat_stems()` you initialize `sr_out = 44100`, then overwrite it every time you read a chunk. You don’t validate that all chunks share the same sample rate for a given stem. If one chunk differs, you’ll silently concatenate arrays that might represent different sample rates (or you’ll end up with inconsistent output metadata). [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

This might never happen if upstream always uses consistent SR, but if it can vary, you should assert consistency.

***

## 7) External dependency risk (not a “bug”, but a common failure mode)

This module depends on a bunch of `stem_service.*` imports (config, scnet\_onnx, phase\_inversion, split, vad, vocal\_stage1). If this file is run standalone without that package available, it will fail immediately on import.   
(That may be expected in your environment, just calling it out as a “won’t run” cause outside the repo/package.) [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

***

# The **most critical** fixes (if you only do 3 things)

1.  **Add fallback return** in `run_4stem_single_pass_or_hybrid()` so SCNet failure doesn’t return `None`. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)
2.  **Fix `main()` full command** to unpack `(stems, models_used)` and stop indexing `Path` objects. [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)
3.  **Repair malformed type annotations** (`\ None` → `| None` or `Optional[...]`). [\[onedrive.live.com\]](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!sc8be88d519c0432cb1c1cfdf5625c64f)

***
