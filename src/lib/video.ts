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

/**
 * Some recordings (MediaRecorder / screen-recorder WebM) report an infinite
 * duration until the browser has seen the end of the file. Seeking far past
 * the end forces it to work the real length out.
 */
export async function knownDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration;
  const back = video.currentTime;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("durationchange", check);
      video.removeEventListener("seeked", check);
      resolve();
    };
    const check = () => {
      if (Number.isFinite(video.duration)) done();
    };
    const timer = setTimeout(done, 8000);
    video.addEventListener("durationchange", check);
    video.addEventListener("seeked", check);
    video.currentTime = 1e7;
  });
  video.currentTime = back;
  if (Number.isFinite(video.duration)) return video.duration;
  const seekable = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
  return Number.isFinite(seekable) && seekable > 0 ? seekable : 0;
}
