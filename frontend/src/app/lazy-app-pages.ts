import { lazy } from "react";

export const LazyPricingPage = lazy(() =>
  import("../components/PricingPage").then((m) => ({ default: m.PricingPage })),
);
export const LazyMyStemsPage = lazy(() =>
  import("../components/MyStemsPage").then((m) => ({ default: m.MyStemsPage })),
);
export const LazySpeechCleanPage = lazy(() =>
  import("../pages/SpeechCleanPage").then((m) => ({ default: m.SpeechCleanPage })),
);
export const LazyMidiConvertPage = lazy(() =>
  import("../pages/MidiConvertPage").then((m) => ({ default: m.MidiConvertPage })),
);
export const LazyLibraryPage = lazy(() =>
  import("../pages/LibraryPage").then((m) => ({ default: m.LibraryPage })),
);
export const LazyTunerPage = lazy(() =>
  import("../pages/TunerPage").then((m) => ({ default: m.TunerPage })),
);
export const LazyEditorMainView = lazy(() =>
  import("./editor-main-view.component").then((m) => ({
    default: m.EditorMainView,
  })),
);
export const LazyTransitionalEditorShell = lazy(() =>
  import("../components/EditorAppShell").then((m) => ({
    default: m.EditorAppShell,
  })),
);
