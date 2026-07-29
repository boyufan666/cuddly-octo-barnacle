mergeInto(LibraryManager.library, {
  Rehab_PostTrainingResult: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    if (!window.RehabUnityBridge || typeof window.RehabUnityBridge.postTrainingResultJson !== "function") {
      throw new Error("window.RehabUnityBridge.postTrainingResultJson is required.");
    }

    window.RehabUnityBridge.postTrainingResultJson(json);
  }
});
