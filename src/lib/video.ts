/** An off-screen video element for frame-accurate seeking during analysis. */
export function loadHiddenVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("This video format can't be decoded by your browser."));
    v.src = src;
  });
}
