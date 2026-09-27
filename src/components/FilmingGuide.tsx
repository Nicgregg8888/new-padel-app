/** Where to put the camera: the single biggest factor in how well analysis works. */
export function FilmingGuide({ open = false }: { open?: boolean }) {
  return (
    <details className="filming-guide" open={open}>
      <summary>How to film your match for the best analysis</summary>
      <div className="fg-body">
        <figure className="fg-figure">
          <svg viewBox="0 0 340 200" role="img" aria-label="Camera behind one baseline, high up and centred, seeing the whole court">
            {/* Side view: camera high behind the near baseline, looking down the court */}
            <text x="10" y="16" className="fg-cap">
              Side view
            </text>
            <line x1="20" y1="170" x2="330" y2="170" className="fg-ground" />
            <rect x="90" y="164" width="230" height="6" className="fg-court" />
            <line x1="205" y1="150" x2="205" y2="170" className="fg-net" />
            <line x1="70" y1="170" x2="70" y2="60" className="fg-pole" />
            <rect x="60" y="48" width="20" height="14" rx="3" className="fg-cam" />
            <polygon points="80,55 320,148 320,170 90,170" className="fg-view" />
            <text x="10" y="118" className="fg-note">
              2.5–4 m
            </text>
            <text x="120" y="192" className="fg-note">
              whole court + far glass in view
            </text>
            <text x="88" y="44" className="fg-note">
              behind a baseline
            </text>
          </svg>
        </figure>
        <ul className="fg-list">
          <li>
            <b>Behind one baseline, centred and high up:</b> 2.5–4 m if you can (clamp on the back fence or film
            from the first row of the stands).
          </li>
          <li>
            <b>All of the court in frame,</b> including the far players' feet and the far glass. Landscape, no zooming
            or panning.
          </li>
          <li>
            <b>1080p at 30 fps or more;</b> 60 fps if you want ball tracking.
          </li>
          <li>
            <b>Keep it steady</b> on a tripod or clamp, and don't film into the sun or bright floodlights.
          </li>
          <li>
            <b>Record the whole match.</b> You can analyse one set at a time later with Start/End.
          </li>
        </ul>
      </div>
    </details>
  );
}
