// SERIES TEMPLATE - shared by all 18 episodes.
// Do not put project content here. Everything below stays identical across the series:
// timing, chapter labels and order, palette, typography, safe areas, subtitles,
// transitions and the opening/closing composition.
window.SERIES = {
  name: 'AI at ACCIONA',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 45,

  // Fixed 45-second structure. Chapter labels and order never change.
  timeline: [
    { id: 'opening', start: 0, end: 4, label: null },
    { id: 'project', start: 4, end: 11, label: 'The project' },
    { id: 'need', start: 11, end: 17, label: 'The need' },
    { id: 'how', start: 17, end: 30, label: 'How it works' },
    { id: 'value', start: 30, end: 37, label: 'Value' },
    { id: 'next', start: 37, end: 43, label: 'What’s next' },
    { id: 'closing', start: 43, end: 45, label: null },
  ],

  palette: {
    bg: '#050507',
    surface: '#101116',
    surface2: '#181a22',
    line: '#2a2d38',
    text: '#FFFFFF',
    text2: '#D6D9E0',
    muted: '#8b90a0',
    red: '#E52529',
    redGlow: 'rgba(229,37,41,0.45)',
    cyan: '#2EE6F2',
    cyanGlow: 'rgba(46,230,242,0.40)',
  },

  // Sizes in px at 1080 x 1920.
  type: {
    family: "SeriesSans, Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    title: 140, // project title (110-150)
    message: 92, // main message (76-100); auto-shrinks to messageMin before wrapping to a 3rd line
    messageMin: 76,
    subMessage: 64, // opening/closing tagline
    chapter: 54, // chapter label (48-60)
    subtitle: 52, // subtitles (48-56)
    subtitleLineHeight: 66,
    label: 44, // diagram labels (>= 42)
    labelMin: 42,
    note: 32, // non-essential footnotes such as "Illustrative example"
  },

  // Conservative working safe area (not a universal platform spec).
  safe: { left: 90, right: 180, top: 160, bottom: 340 },

  // Vertical layout bands inside the safe area.
  layout: {
    progressY: 176, // chapter progress bar
    chapterY: 262, // chapter label baseline
    messageTop: 300, // first line top of the main message
    visualTop: 560, // main visual band
    visualBottom: 1360,
    subtitleBottom: 1580, // = height - safe.bottom
    subtitleMaxLines: 2,
  },

  transition: {
    wipe: 0.42, // red slash wipe at each chapter cut (seconds)
    messageIn: 0.35,
    messageOut: 0.25,
  },
};
