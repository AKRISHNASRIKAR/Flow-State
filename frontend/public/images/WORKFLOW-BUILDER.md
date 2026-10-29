# Workflow builder captures

The light and dark WebP images show the actual FlowState builder with the Web request inspector open. They were captured from an isolated local Worker/D1 workspace using the normal session refresh, ownership and workflow APIs. The example workflow is named Report handoff. It contains a manual trigger, an HTTP request and a log step; no external request was executed to obtain these images.

Capture: 1440 × 1080 desktop viewport, cropped to the working area. Files are encoded at WebP quality 90. `BuilderPreview.tsx` imports them statically so their URLs include a build-generated content hash. Images load lazily below the interactive example, and both appearances use the same geometry.

The demonstration user, sign-in helper, temporary Worker configuration and local database are not application features and must not be shipped. To replace these images, capture the real builder again, keep the example-workflow caption, and exclude account information, secrets and unrelated browser chrome.
