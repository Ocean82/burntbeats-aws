pip install onnxruntime-tools
Project description
Transformer Model Optimization Tool Overview
ONNX Runtime automatically applies most optimizations while loading a transformer model. Some of the latest optimizations that have not yet been integrated into ONNX Runtime are available in this tool that tunes models for the best performance.

This tool can help in the following senarios:

Model is exported by tf2onnx or keras2onnx, and ONNX Runtime does not have graph optimization for them right now.
Convert model to use float16 to boost performance using mixed precision on GPUs with Tensor Cores (like V100 or T4).
Model has inputs with dynamic axis, which blocks some optimizations to be applied in ONNX Runtime due to shape inference.
Disable or enable some fusions to see its impact on performance or accuracy.
Installation
First you need install onnxruntime or onnxruntime-gpu package for CPU or GPU inference. To use onnxruntime-gpu, it is required to install CUDA and cuDNN and add their bin directories to PATH environment variable.

Limitations
Due to CUDA implementation of Attention kernel, maximum number of attention heads is 1024. Normally, maximum supported sequence length is 4096 for Longformer and 1024 for other types of models.

Export a transformer model to ONNX
PyTorch could export model to ONNX. The tf2onnx and keras2onnx tools can be used to convert model that trained by Tensorflow. Huggingface transformers has a notebook shows an example of exporting a pretrained model to ONNX. For Keras2onnx, please refer to its example script. For tf2onnx, please refer to its BERT tutorial.

GPT-2 Model conversion
Converting GPT-2 model from PyTorch to ONNX is not straightforward when past state is used. We add a tool convert_to_onnx to help you.

You can use commands like the following to convert a pre-trained PyTorch GPT-2 model to ONNX for given precision (float32, float16 or int8):

python -m onnxruntime.transformers.convert_to_onnx -m gpt2 --model_class GPT2LMHeadModel --output gpt2.onnx -p fp32
python -m onnxruntime.transformers.convert_to_onnx -m distilgpt2 --model_class GPT2LMHeadModel --output distilgpt2.onnx -p fp16 --use_gpu --optimize_onnx
python -m onnxruntime.transformers.convert_to_onnx -m [path_to_gpt2_pytorch_model_directory] --output quantized.onnx -p int32 --optimize_onnx
The tool will also verify whether the ONNX model and corresponding PyTorch model generate same outputs given same random inputs.

Longformer Model conversion
Requirement: Linux OS (For example Ubuntu 18.04 or 20.04) and a python environment like the following:

conda create -n longformer python=3.6
conda activate longformer
conda install pytorch torchvision torchaudio cpuonly -c pytorch
pip install onnx transformers onnxruntime
Next, get the source of torch extensions for Longformer exporting, and run the following:

python setup.py install
It will generate file like "build/lib.linux-x86_64-3.6/longformer_attention.cpython-36m-x86_64-linux-gnu.so" under the directory.

Finally, use convert_longformer_to_onnx to convert to ONNX model like the following:

python convert_longformer_to_onnx.py -m longformer-base-4096
The exported ONNX model can only run in GPU right now.

Model Optimizer
In your python code, you can use the optimizer like the following:

from onnxruntime.transformers import optimizer
optimized_model = optimizer.optimize_model("gpt2.onnx", model_type='gpt2', num_heads=12, hidden_size=768)
optimized_model.convert_model_float32_to_float16()
optimized_model.save_model_to_file("gpt2_fp16.onnx")
You can also use command line. Example of optimizing a BERT-large model to use mixed precision (float16):

python -m onnxruntime.transformers.optimizer --input bert_large.onnx --output bert_large_fp16.onnx --num_heads 16 --hidden_size 1024 --float16
You can also download the latest script files from here. Then run it like the following:

python optimizer.py --input gpt2.onnx --output gpt2_opt.onnx --model_type gpt2
Optimizer Options
See below for description of some options of optimizer.py:

input: input model path
output: output model path
model_type: (defaul: bert) There are 4 model types: bert (exported by PyTorch), gpt2 (exported by PyTorch), and bert_tf (BERT exported by tf2onnx), bert_keras (BERT exported by keras2onnx) respectively.
num_heads: (default: 12) Number of attention heads. BERT-base and BERT-large has 12 and 16 respectively.
hidden_size: (default: 768) BERT-base and BERT-large has 768 and 1024 hidden nodes respectively.
input_int32: (optional) Exported model ususally uses int64 tensor as input. If this flag is specified, int32 tensors will be used as input, and it could avoid un-necessary Cast nodes and get better performance.
float16: (optional) By default, model uses float32 in computation. If this flag is specified, half-precision float will be used. This option is recommended for NVidia GPU with Tensor Core like V100 and T4. For older GPUs, float32 is likely faster.
use_gpu: (optional) When opt_level > 1, please set this flag for GPU inference.
opt_level: (optional) Set a proper graph optimization level of OnnxRuntime: 0 - disable all (default), 1 - basic, 2 - extended, 99 - all. If the value is positive, OnnxRuntime will be used to optimize graph first.
verbose: (optional) Print verbose information when this flag is specified.
Supported Models
Here is a list of PyTorch models from Huggingface Transformers that have been tested using the optimizer:

BERT
DistilBERT
DistilGPT2
RoBERTa
ALBERT
GPT-2 (GPT2Model, GPT2LMHeadModel)
For Tensorflow model, we only tested BERT model so far.

Most optimizations require exact match of a subgraph. Any layout change in subgraph might cause some optimization not working. Note that different versions of training or export tool might lead to different graph layouts. It is recommended to use latest released version of PyTorch and Transformers.

If your model is not in the list, it might only be partial optimized or not optimized at all.

Benchmark
There is a bash script run_benchmark.sh for running benchmark. You can modify the bash script to choose your options (like models to test, batch sizes, sequence lengths, target device etc) before running.

The bash script will call benchmark.py script to measure inference performance of OnnxRuntime, PyTorch or PyTorch+TorchScript on pretrained models of Huggingface Transformers.

Benchmark Results on V100
In the following benchmark results, ONNX Runtime uses optimizer for model optimization, and IO binding is enabled.

We tested on Tesla V100-PCIE-16GB GPU (CPU is Intel Xeon(R) E5-2690 v4) for different batch size (b) and sequence length (s). Below result is average latency of per inference in miliseconds.

bert-base-uncased (BertModel)
The model has 12 layers and 768 hidden, with input_ids as input.

engine	version	precision	b	s=8	s=16	s=32	s=64	s=128	s=256	s=512
torchscript	1.5.1	fp32	1	7.92	8.78	8.91	9.18	9.56	9.39	12.83
onnxruntime	1.4.0	fp32	1	1.38	1.42	1.67	2.15	3.11	5.37	10.74
onnxruntime	1.4.0	fp16	1	1.30	1.29	1.31	1.33	1.45	1.95	3.36
onnxruntime	1.4.0	fp32	4	1.51	1.93	2.98	5.01	9.13	17.95	38.15
onnxruntime	1.4.0	fp16	4	1.27	1.35	1.43	1.83	2.66	4.40	9.76
run_benchmark.sh is used to get the results.

gpt2 (GPT2LMHeadModel)
The model has 12 layers and 768 hidden, with input_ids, position_ids, attention_mask and past state as inputs.

engine	version	precision	b	s=4	s=8	s=32	s=128
torchscript	1.5.1	fp32	1	5.80	5.77	5.82	5.78
onnxruntime	1.4.0	fp32	1	1.42	1.42	1.43	1.47
onnxruntime	1.4.0	fp16	1	1.54	1.54	1.58	1.64
onnxruntime	1.4.0	fp32	8	1.83	1.84	1.90	2.13
onnxruntime	1.4.0	fp16	8	1.74	1.75	1.81	2.09
onnxruntime	1.4.0	fp32	32	2.19	2.21	2.45	3.34
onnxruntime	1.4.0	fp16	32	1.66	1.71	1.85	2.73
onnxruntime	1.4.0	fp32	128	4.15	4.37	5.15	8.61
onnxruntime	1.4.0	fp16	128	2.47	2.58	3.26	6.16
Since past state is used, sequence length in input_ids is 1. For example, s=4 means the past sequence length is 4 and the total sequence length is 5.

benchmark_gpt2.py is used to get the results like the following commands:

python -m onnxruntime.transformers.benchmark_gpt2 --use_gpu -m gpt2 -o -v -b 1 8 32 128 -s 4 8 32 128 -p fp32
python -m onnxruntime.transformers.benchmark_gpt2 --use_gpu -m gpt2 -o -v -b 1 8 32 128 -s 4 8 32 128 -p fp16
Benchmark.py
If you use run_benchmark.sh, you need not use benchmark.py directly. You can skip this section if you do not want to know the details.

Below is example to runing benchmark.py on pretrained model bert-base-cased on GPU.

python -m onnxruntime.transformers.benchmark -g -m bert-base-cased -o -v -b 0
python -m onnxruntime.transformers.benchmark -g -m bert-base-cased -o
python -m onnxruntime.transformers.benchmark -g -m bert-base-cased -e torch
python -m onnxruntime.transformers.benchmark -g -m bert-base-cased -e torchscript
The first command will generate ONNX models (both before and after optimizations), but not run performance tests since batch size is 0. The other three commands will run performance test on each of three engines: OnnxRuntime, PyTorch and PyTorch+TorchScript.

If you remove -o parameter, optimizer script is not used in benchmark.



If you want to benchmark on CPU, you can remove -g option in the commands.

Note that our current benchmark on GPT2 and DistilGPT2 models has disabled past state from inputs and outputs.

By default, ONNX model has only one input (input_ids). You can use -i parameter to test models with multiple inputs. For example, we can add "-i 3" to command line to test a bert model with 3 inputs (input_ids, token_type_ids and attention_mask). This option only supports OnnxRuntime right now.

BERT Model Verification
If your BERT model has three inputs (like input_ids, token_type_ids and attention_mask), a script compare_bert_results.py can be used to do a quick verification. The tool will generate some fake input data, and compare results from both the original and optimized models. If outputs are all close, it is safe to use the optimized model.

Example of verifying models optimized for CPU:

python -m onnxruntime.transformers.compare_bert_results --baseline_model original_model.onnx --optimized_model optimized_model_cpu.onnx --batch_size 1 --sequence_length 128 --samples 100
For GPU, please append --use_gpu to the command.

Performance Test
bert_perf_test.py can be used to check the BERT model inference performance. Below are examples:

python -m onnxruntime.transformers.bert_perf_test --model optimized_model_cpu.onnx --batch_size 1 --sequence_length 128
For GPU, please append --use_gpu to the command.

After test is finished, a file like perf_results_CPU_B1_S128_<date_time>.txt or perf_results_GPU_B1_S128_<date_time>.txt will be output to the model directory.

Profiling
profiler.py can be used to run profiling on a transformer model. It can help figure out the bottleneck of a model, and CPU time spent on a node or subgraph.

Examples commands:

python -m onnxruntime.transformers.profiler --model bert.onnx --batch_size 8 --sequence_length 128 --samples 1000 --dummy_inputs bert --thread_num 8 --kernel_time_only
python -m onnxruntime.transformers.profiler --model gpt2.onnx --batch_size 1 --sequence_length 1 --past_sequence_length 128 --samples 1000 --dummy_inputs gpt2 --use_gpu
python -m onnxruntime.transformers.profiler --model longformer.onnx --batch_size 1 --sequence_length 4096 --global_length 8 --samples 1000 --dummy_inputs longformer --use_gpu
Result file like onnxruntime_profile__<date_time>.json will be output to current directory. Summary of nodes, top expensive nodes and results grouped by operator type will be printed to console.

Configuration
OptimizationConfig
class optimum.onnxruntime.configuration.OptimizationConfig
<
source
>
( optimization_level: int = 1optimize_for_gpu: bool = Falseoptimize_with_onnxruntime_only: bool = Falsedisable_gelu: bool = Falsedisable_layer_norm: bool = Falsedisable_attention: bool = Falsedisable_skip_layer_norm: bool = Falsedisable_bias_skip_layer_norm: bool = Falsedisable_bias_gelu: bool = Falseenable_gelu_approximation: bool = Falseuse_mask_index: bool = Falseno_attention_mask: bool = Falsedisable_embed_layer_norm: bool = True )

Parameters

optimization_level (int, defaults to 1) — ONNX opset version to export the model with. Optimization level performed by ONNX Runtime of the loaded graph. Supported optimization level are 0, 1, 2 and 99. 0 will disable all optimizations. 1 will enable basic optimizations. 2 will enable basic and extended optimizations, including complex node fusions applied to the nodes assigned to the CPU or CUDA execution provider, making the resulting optimized graph hardware dependent. 99 will enable all available optimizations including layout optimizations.
optimize_for_gpu (bool, defaults to False) — Whether to optimize the model for GPU inference. The optimized graph might contain operators for GPU or CPU only when optimization_level > 1.
optimize_with_onnxruntime_only (bool, defaults to False) — Whether to only use ONNX Runtime to optimize the model and no graph fusion in Python.
disable_gelu (bool, defaults to False) — Whether to disable the Gelu fusion.
disable_layer_norm (bool, defaults to False) — Whether to disable Layer Normalization fusion.
disable_attention (bool, defaults to False) — Whether to disable Attention fusion.
disable_skip_layer_norm (bool, defaults to False) — Whether to disable SkipLayerNormalization fusion.
disable_bias_skip_layer_norm (bool, defaults to False) — Whether to disable Add Bias and SkipLayerNormalization fusion.
disable_bias_gelu (bool, defaults to False) — Whether to disable Add Bias and Gelu / FastGelu fusion.
enable_gelu_approximation (bool, defaults to False) — Whether to enable Gelu / BiasGelu to FastGelu conversion. The default value is set to False since this approximation might slightly impact the model’s accuracy.
use_mask_index (bool, defaults to False) — Whether to use mask index instead of raw attention mask in the attention operator.
no_attention_mask (bool, defaults to False) — Whether to not use attention masks. Only works for bert model type.
disable_embed_layer_norm (bool, defaults to True) — Whether to disable EmbedLayerNormalization fusion. The default value is set to True since this fusion is incompatible with ONNX Runtime quantization
OptimizationConfig is the configuration class handling all the ONNX Runtime optimization parameters.

QuantizationConfig
class optimum.onnxruntime.configuration.QuantizationConfig
<
source
>
( is_static: boolformat: QuantFormatmode: QuantizationMode = <QuantizationMode.QLinearOps: 1>activations_dtype: QuantType = <QuantType.QUInt8: 1>activations_symmetric: bool = Falseweights_dtype: QuantType = <QuantType.QInt8: 0>weights_symmetric: bool = Trueper_channel: bool = Falsereduce_range: bool = Falsenodes_to_quantize: typing.List[str] = <factory>nodes_to_exclude: typing.List[str] = <factory>operators_to_quantize: typing.List[str] = <factory>qdq_add_pair_to_weight: bool = Falseqdq_dedicated_pair: bool = Falseqdq_op_type_per_channel_support_to_axis: typing.Dict[str, int] = <factory> )

Parameters

is_static (bool) — Whether to apply static quantization or dynamic quantization.
format (QuantFormat) — Targeted ONNX Runtime quantization representation format. For the Operator Oriented (QOperator) format, all the quantized operators have their own ONNX definitions. For the Tensor Oriented (QDQ) format, the model is quantized by inserting QuantizeLinear / DeQuantizeLinear operators.
mode (QuantizationMode, defaults to QuantizationMode.QLinearOps) — Targeted ONNX Runtime quantization mode, default is QLinearOps to match QDQ format. When targeting dynamic quantization mode, the default value is QuantizationMode.IntegerOps whereas the default value for static quantization mode is QuantizationMode.QLinearOps.
activations_dtype (QuantType, defaults to QuantType.QUInt8) — The quantization data types to use for the activations.
activations_symmetric (bool, defaults to False) — Whether to apply symmetric quantization on the activations.
weights_dtype (QuantType, defaults to QuantType.QInt8) — The quantization data types to use for the weights.
weights_symmetric (bool, defaults to True) — Whether to apply symmetric quantization on the weights.
per_channel (bool, defaults to False) — Whether we should quantize per-channel (also known as “per-row”). Enabling this can increase overall accuracy while making the quantized model heavier.
reduce_range (bool, defaults to False) — Whether to use reduce-range 7-bits integers instead of 8-bits integers.
nodes_to_quantize (list) — List of the nodes names to quantize.
nodes_to_exclude (list) — List of the nodes names to exclude when applying quantization.
operators_to_quantize (list) — List of the operators types to quantize.
qdq_add_pair_to_weight (bool, defaults to False) — By default, floating-point weights are quantized and feed to solely inserted DeQuantizeLinear node. If set to True, the floating-point weights will remain and both QuantizeLinear / DeQuantizeLinear nodes will be inserted.
qdq_dedicated_pair (bool, defaults to False) — When inserting QDQ pair, multiple nodes can share a single QDQ pair as their inputs. If True, it will create an identical and dedicated QDQ pair for each node.
qdq_op_type_per_channel_support_to_axis (Dict[str, int]) — Set the channel axis for a specific operator type. Effective only when per channel quantization is supported and per_channel is set to True.
QuantizationConfig is the configuration class handling all the ONNX Runtime quantization parameters.

CalibrationConfig
class optimum.onnxruntime.configuration.CalibrationConfig
<
source
>
( dataset_name: strdataset_config_name: strdataset_split: strdataset_num_samples: intmethod: CalibrationMethodnum_bins: typing.Optional[int] = Nonenum_quantized_bins: typing.Optional[int] = Nonepercentile: typing.Optional[float] = Nonemoving_average: typing.Optional[bool] = Noneaveraging_constant: typing.Optional[float] = None )

Parameters

dataset_name (str) — The name of the calibration dataset.
dataset_config_name (str) — The name of the calibration dataset configuration.
dataset_split (str) — Which split of the dataset is used to perform the calibration step.
dataset_num_samples (int) — The number of samples composing the calibration dataset.
method (CalibrationMethod) — The method chosen to calculate the activations quantization parameters using the calibration dataset.
num_bins (int, optional) — The number of bins to use when creating the histogram when performing the calibration step using the Percentile or Entropy method.
num_quantized_bins (int, optional) — The number of quantized bins to use when performing the calibration step using the Entropy method.
percentile (float, optional) — The percentile to use when computing the activations quantization ranges when performing the calibration step using the Percentile method.
moving_average (bool, optional) — Whether to compute the moving average of the minimum and maximum values when performing the calibration step using the MinMax method.
averaging_constant (float, optional) — The constant smoothing factor to use when computing the moving average of the minimum and maximum values. Effective only when the MinMax calibration method is selected and moving_average is set to True.
CalibrationConfig is the configuration class handling all the ONNX Runtime parameters related to the calibration step of static quantization.

ORTConfig
class optimum.onnxruntime.ORTConfig
<
source
>
( opset: typing.Optional[int] = Noneuse_external_data_format: bool = Falseoptimization: typing.Optional[optimum.onnxruntime.configuration.OptimizationConfig] = Nonequantization: typing.Optional[optimum.onnxruntime.configuration.QuantizationConfig] = None**kwargs )

Parameters

opset (int, optional) — ONNX opset version to export the model with.
use_external_data_format (bool, optional, defaults to False) — Allow exporting model >= than 2Gb.
optimization (OptimizationConfig, optional, defaults to None) — Specify a configuration to optimize ONNX Runtime model
quantization (QuantizationConfig, optional, defaults to None) — Specify a configuration to quantize ONNX Runtime model
ORTConfig is the configuration class handling all the ONNX Runtime parameters related to the ONNX IR model export, optimization and quantization parameters.

Optimization
🤗 Optimum provides an optimum.onnxruntime package that enables you to apply graph optimization on many model hosted on the 🤗 hub using the ONNX Runtime model optimization tool.

ORTOptimizer
class optimum.onnxruntime.ORTOptimizer
<
source
>
( tokenizer: PreTrainedTokenizermodel: PreTrainedModelfeature: str = 'default'opset: typing.Optional[int] = None )

Handles the ONNX Runtime optimization process for models shared on huggingface.co/models.

export
<
source
>
( onnx_model_path: typing.Union[str, os.PathLike]onnx_optimized_model_output_path: typing.Union[str, os.PathLike]optimization_config: OptimizationConfiguse_external_data_format: bool = False )

Parameters

onnx_model_path (Union[str, os.PathLike]) — The path used to save the model exported to an ONNX Intermediate Representation (IR).
onnx_optimized_model_output_path (Union[str, os.PathLike]) — The path used to save the optimized model exported to an ONNX Intermediate Representation (IR).
optimization_config (OptimizationConfig) — The configuration containing the parameters related to optimization.
use_external_data_format (bool, defaults to False) — Whether uto se external data format to store model which size is >= 2Gb.
Optimize a model given the optimization specifications defined in optimization_config.

from_pretrained
<
source
>
( model_name_or_path: typing.Union[str, os.PathLike]feature: stropset: typing.Optional[int] = None )

Parameters

model_name_or_path (Union[str, os.PathLike]) — Repository name in the Hugging Face Hub or path to a local directory hosting the model.
feature (str) — Feature to use when exporting the model.
opset (int, optional) — ONNX opset version to export the model with.
Instantiate a ORTOptimizer from a pretrained pytorch model and tokenizer.

get_fused_operators
<
source
>
( onnx_model_path: typing.Union[str, os.PathLike] )

Parameters

onnx_model_path (Union[str, os.PathLike]) — Path of the ONNX model.
Compute the dictionary mapping the name of the fused operators to their number of apparition in the model.

get_nodes_number_difference
<
source
>
( onnx_model_path: typing.Union[str, os.PathLike]onnx_optimized_model_path: typing.Union[str, os.PathLike] )

Parameters

onnx_model_path (Union[str, os.PathLike]) — Path of the ONNX model.
onnx_optimized_model_path (Union[str, os.PathLike]) — Path of the optimized ONNX model.
Compute the difference in the number of nodes between the original and the optimized model.

get_operators_difference
<
source
>
( onnx_model_path: typing.Union[str, os.PathLike]onnx_optimized_model_path: typing.Union[str, os.PathLike] )

Parameters

onnx_model_path (Union[str, os.PathLike]) — Path of the ONNX model.
onnx_optimized_model_path (Union[str, os.PathLike]) — Path of the optimized ONNX model.
Compute the dictionary mapping the operators name to the difference in the number of corresponding nodes between the original and the optimized model.