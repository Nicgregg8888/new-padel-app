/** An off-screen video element for frame-accurate seeking during analysis. */
export function loadHiddenVideo(src: string, opts: { attach?: boolean } = {}): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    if (opts.attach) {
      // Browsers only present frames (and fire requestVideoFrameCallback) for a
      // rendered video, so keep it in the page as a near-invisible speck.
      Object.assign(v.style, {
        position: "fixed",
        right: "0",
        bottom: "0",
        width: "2px",
        height: "2px",
        opacity: "0.01",
        pointerEvents: "none",
      });
      document.body.appendChild(v);
    }
    v.onloadeddata = () => resolve(v);
    v.onerror = () => {
      v.remove();
      reject(new Error("This video format can't be decoded by your browser."));
    };
    v.src = src;
  });
}
