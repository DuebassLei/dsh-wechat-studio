# Feishu image import implementation plan

**Goal:** Transfer Feishu Markdown images to Cloudinary when the user clicks 放上稿面.

**Design:** Use the existing article creation endpoint and server-side signed Cloudinary uploads. Cloudinary pulls the original Feishu URL, so DSH does not forward browser cookies or fetch arbitrary URLs. Store the returned HTTPS links before rendering. Leave the import dialog and its Markdown intact on failure.

**Steps:**

1. Add Cloudinary settings in `src/settings.js` and `client/app.jsx`. Return configuration status without exposing the secret.
2. Implement Feishu image recognition, deduplicated upload and Markdown replacement in `src/cloudinary.js`. Call it before persistence in `src/host.js` and show submission progress.
3. Exercise the import endpoint with mocked uploads, including failures, then run `npm test` and `npm run build`. Document configuration and how to handle expired Feishu links.
