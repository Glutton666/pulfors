# ONNX Model Files for Stem Separation

Place Demucs ONNX model files here for the on-device stem separation feature.

Required files:
- `htdemucs.ort`   — 4-stem model (vocals / drums / bass / other)
- `htdemucs_6s.ort` — 6-stem model (vocals / drums / bass / guitar / piano / other)

## How to obtain

Convert the official Demucs PyTorch checkpoints to ONNX/ORT format using
the `demucs` Python package and `torch.onnx.export`, then optimize with
`python -m onnxruntime.tools.convert_onnx_models_to_ort`.

## Build integration

These files must be bundled with a custom Expo development client build.
Metro is already configured to include `.ort` files as assets.
See metro.config.js for the asset extensions config.

Note: This feature is NOT available in Expo Go — it requires a custom
native build with onnxruntime-react-native linked.
