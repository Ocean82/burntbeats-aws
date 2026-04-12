# Pipeline sample matrix  (20260412_164549Z)
**Matrix wall clock:** 193.33s (2026-04-12T16:45:49.542Z → 2026-04-12T16:49:02.872Z)
**Sum of scenario times:** 189.952s (parallel-capable steps not parallelized here)
Source: `D:\burntbeats-aws\tmp_test\pipeline_matrix_20260412_135049Z\sample_30s.wav`
Clip: `D:\burntbeats-aws\tmp_test2\sample_30s.wav` (30.0s)

| ID | Status | Seconds | Start (UTC) | End (UTC) | Models | Notes |
|----|--------|---------|-------------|-----------|--------|-------|
| 01_2stem_fast_main | ok | 13.49 | 2026-04-12T16:45:49.544Z | 2026-04-12T16:46:03.032Z | UVR_MDXNET_3_9662.onnx, phase_inversion |  |
| 02_2stem_fast_backup | ok | 13.27 | 2026-04-12T16:46:03.405Z | 2026-04-12T16:46:16.671Z | UVR_MDXNET_KARA.onnx, phase_inversion |  |
| 03_2stem_quality_main | ok | 74.84 | 2026-04-12T16:46:17.097Z | 2026-04-12T16:47:31.939Z | mdx23c_vocal.onnx, mdx23c_instrumental.onnx |  |
| 04_2stem_quality_backup | ok | 76.34 | 2026-04-12T16:47:33.403Z | 2026-04-12T16:48:49.738Z | Kim_Vocal_2.onnx, phase_inversion |  |
| 05_4stem_fast_main | error | 5.32 | 2026-04-12T16:48:50.454Z | 2026-04-12T16:48:55.770Z | d12395a8-e57c48e6.th | Demucs bag (d12395a8) failed: Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 109, in <module>
    main()
    ~~~~^^
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 105, in main
    runpy.run_module("demucs", run_name="__main__", alter_sys=True)
    ~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "<frozen runpy>", line 226, in run_module
  File "<frozen runpy>", line 98, in _run_module_code
  File "<frozen runpy>", line 88, in _run_code
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\__main__.py", line 10, in <module>
    main()
    ~~~~^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\separate.py", line 133, in main
    model = get_model_from_args(args)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 96, in get_model_from_args
    return get_model(name=args.name, repo=args.repo)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 76, in get_model
    model = any_repo.get_model(name)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 146, in get_model
    return self.model_repo.get_model(name_or_sig)
           ~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 101, in get_model
    return load_model(file)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\states.py", line 59, in load_model
    package = torch.load(path, 'cpu')
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 70, in _load
    return _real(*args, **kwargs)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\torch\serialization.py", line 1529, in load
    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, [1mdo those steps only if you trust the source of the checkpoint[0m. 
	(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
	(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
	WeightsUnpickler error: Unsupported global: GLOBAL demucs.htdemucs.HTDemucs was not an allowed global by default. Please use `torch.serialization.add_safe_globals([demucs.htdemucs.HTDemucs])` or the `torch.serialization.safe_globals([demucs.htdemucs.HTDemucs])` context manager to allowlist this global if you trust this class/function.

Check the documentation of torch.load to learn more about types accepted by default with weights_only https://pytorch.org/docs/stable/generated/torch.load.html.
 |
| 06_4stem_fast_backup | error | 3.61 | 2026-04-12T16:48:55.855Z | 2026-04-12T16:48:59.465Z | cfa93e08-61801ae1.th | Demucs bag (cfa93e08) failed: Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 109, in <module>
    main()
    ~~~~^^
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 105, in main
    runpy.run_module("demucs", run_name="__main__", alter_sys=True)
    ~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "<frozen runpy>", line 226, in run_module
  File "<frozen runpy>", line 98, in _run_module_code
  File "<frozen runpy>", line 88, in _run_code
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\__main__.py", line 10, in <module>
    main()
    ~~~~^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\separate.py", line 133, in main
    model = get_model_from_args(args)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 96, in get_model_from_args
    return get_model(name=args.name, repo=args.repo)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 76, in get_model
    model = any_repo.get_model(name)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 146, in get_model
    return self.model_repo.get_model(name_or_sig)
           ~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 101, in get_model
    return load_model(file)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\states.py", line 59, in load_model
    package = torch.load(path, 'cpu')
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 70, in _load
    return _real(*args, **kwargs)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\torch\serialization.py", line 1529, in load
    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, [1mdo those steps only if you trust the source of the checkpoint[0m. 
	(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
	(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
	WeightsUnpickler error: Unsupported global: GLOBAL demucs.hdemucs.HDemucs was not an allowed global by default. Please use `torch.serialization.add_safe_globals([demucs.hdemucs.HDemucs])` or the `torch.serialization.safe_globals([demucs.hdemucs.HDemucs])` context manager to allowlist this global if you trust this class/function.

Check the documentation of torch.load to learn more about types accepted by default with weights_only https://pytorch.org/docs/stable/generated/torch.load.html.
 |
| 07_4stem_quality_main | error | 3.10 | 2026-04-12T16:48:59.630Z | 2026-04-12T16:49:02.728Z | 04573f0d-f3cf25b2.th | Demucs bag (04573f0d) failed: Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 109, in <module>
    main()
    ~~~~^^
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 105, in main
    runpy.run_module("demucs", run_name="__main__", alter_sys=True)
    ~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "<frozen runpy>", line 226, in run_module
  File "<frozen runpy>", line 98, in _run_module_code
  File "<frozen runpy>", line 88, in _run_code
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\__main__.py", line 10, in <module>
    main()
    ~~~~^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\separate.py", line 133, in main
    model = get_model_from_args(args)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 96, in get_model_from_args
    return get_model(name=args.name, repo=args.repo)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\pretrained.py", line 76, in get_model
    model = any_repo.get_model(name)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 146, in get_model
    return self.model_repo.get_model(name_or_sig)
           ~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\repo.py", line 101, in get_model
    return load_model(file)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\demucs\states.py", line 59, in load_model
    package = torch.load(path, 'cpu')
  File "D:\burntbeats-aws\stem_service\demucs_entry.py", line 70, in _load
    return _real(*args, **kwargs)
  File "C:\Users\sammy\AppData\Roaming\Python\Python314\site-packages\torch\serialization.py", line 1529, in load
    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, [1mdo those steps only if you trust the source of the checkpoint[0m. 
	(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
	(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
	WeightsUnpickler error: Unsupported global: GLOBAL demucs.htdemucs.HTDemucs was not an allowed global by default. Please use `torch.serialization.add_safe_globals([demucs.htdemucs.HTDemucs])` or the `torch.serialization.safe_globals([demucs.htdemucs.HTDemucs])` context manager to allowlist this global if you trust this class/function.

Check the documentation of torch.load to learn more about types accepted by default with weights_only https://pytorch.org/docs/stable/generated/torch.load.html.
 |
| 08_4stem_quality_backup | skipped | - | - | - | - | quality 4-stem mapping not on disk |
| 09_scnet_4stem | skipped | - | - | - | - | --no-scnet |
