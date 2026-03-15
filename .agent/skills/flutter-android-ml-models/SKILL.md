---
name: flutter-android-ml-models
description: Connect and apply Machine Learning models (.tflite, .pth, .onnx, etc.) to Flutter applications running on Android devices, ensuring rapid loading (under 8 seconds) and smooth UI performance. Use this skill whenever building AI features, integrating neural networks, resolving slow model startup times, or debugging frozen UI during ML inference in Flutter Android apps.
---

# Flutter Android ML Models Skill

This skill provides the architectural patterns and troubleshooting steps necessary to robustly integrate ML models into Flutter apps on Android. A primary goal is ensuring the model connects and initializes in under 8 seconds, without causing UI jank (frozen frames).

## When to Use This Skill
- Integrating `.tflite`, `.pth` (PyTorch), or `.onnx` models into a Flutter project.
- Addressing slow app startup times caused by large machine learning models.
- Fixing UI freezes/jank during object detection, image classification, or other ML inference tasks.
- Optimizing camera frame processing for real-time ML input.

---

## 1. Model Preparation & Conversion
Raw models (especially PyTorch `.pth`) often scale poorly on mobile directly.
- **Convert**: Always guide the user to convert raw `.pth` models to mobile-optimized formats. PyTorch Lite (`.ptl`), ONNX (`.onnx`), or TensorFlow Lite (`.tflite`) are preferred.
- **Quantize**: Recommend post-training quantization (FP32 to INT8). This reduces model size by up to 75% and speeds up I/O and execution significantly.

## 2. Android Build Configuration (Critical for < 8s Load Time)
This is the most common reason for models taking > 8 seconds to load or causing memory crashes on Android.
By default, the Android Asset Packaging Tool (AAPT) compresses assets. Compressed models must be fully decompressed into RAM before use, which is extremely slow for a >50MB model.

**Action**: Instruct AAPT to leave the model uncompressed so the system can memory-map it instantly.

In `android/app/build.gradle`:
```gradle
android {
    // ...
    aaptOptions {
        noCompress 'tflite', 'lite', 'ptl', 'onnx' // Add your model extensions
    }
}
```

Ensure `minSdkVersion` is at least 21 (Lollipop), ideally 23+ for modern ML hardware delegates.

## 3. Asynchronous Initialization & Warm-ups
Never load the model on the main UI thread.
- **Async Boot**: Initialize the model asynchronously during the app boot sequence using functions like `Interpreter.fromAsset`.
- **Warm-up Run**: The first inference is always the slowest because it loads computational kernels and buffers. Perform a "dummy inference" with an empty tensor during the splash screen or background startup so the model is lightning-fast when the user needs it.

## 4. Hardware Acceleration
Always configure the interpreter to use hardware accelerators rather than just the CPU.
- **Delegates**: Attach an NNAPI Delegate (Neural Networks API) or GPU Delegate when initializing the interpreter. This utilizes the device's NPU or GPU.

Example using `tflite_flutter`:
```dart
final gpuDelegateV2 = GpuDelegateV2(
  options: GpuDelegateOptionsV2(
    isPrecisionLossAllowed: false,
    inferencePreference: TfLiteGpuInferenceUsage.fastSingleAnswer,
  ),
);
var interpreterOptions = InterpreterOptions()..addDelegate(gpuDelegateV2);
final interpreter = await Interpreter.fromAsset('model.tflite', options: interpreterOptions);
```

## 5. Efficient Preprocessing & Isolates (Prevent UI Jank)
Once the model is loaded quickly, inference must not drop frames.
- **Background Isolates**: Flutter runs on a single thread. Run inference inside a background worker isolate. If using `tflite_flutter`, use the `IsolateInterpreter` wrapper specifically designed for this.
- **Data Conversion (YUV to RGB)**: Mobile cameras output `YUV_420_888`, but ML models expect RGB. **Do not use slow Dart loops for this.** Guide the user to use native C++ libraries (like `libyuv`) connected via Dart FFI. This avoids memory reallocation pauses and allows real-time 30+ FPS processing.
