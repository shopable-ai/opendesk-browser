const INSET = 12;
export const ENDPOINTS = ['start', 'end'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function mountTimeTrack(template, host, {key, name, format, commit, refresh}) {
  const track = template.content.firstElementChild.cloneNode(true);
  const line = track.querySelector('.vas-track-line');
  const handles = Object.fromEntries(ENDPOINTS.map(part => [part, track.querySelector('[data-endpoint=' + part + ']')]));
  track.setAttribute('aria-label', name + '时间轨道');
  for (const part of ENDPOINTS) {
    const handle = handles[part];
    handle.id = 'vas-' + key + '-' + part + '-slider';
    handle.setAttribute('aria-label', name + (part === 'start' ? '开始' : '结束') + '时间拖动手柄');
    handle.setAttribute('aria-describedby', 'vas-window-' + key + ' vas-error-' + key);
  }
  host.append(track);
  let width = 256;
  const Observer = track.ownerDocument.defaultView.ResizeObserver;
  const observer = Observer && new Observer(([entry]) => {
    const measured = entry.contentRect.width;
    if (measured <= 2 * INSET || width === measured || !points) return;
    width = measured;
    refresh();
  });
  observer?.observe(track);
  let points, window = [0, 1], disabled = true, anchor, suggested = {}, grip;
  const length = () => width - 2 * INSET;
  const x = value => INSET + length() * (value - window[0]) / (window[1] - window[0]);
  const bounds = part => part === 'start' ? [window[0], points.end - 1] : [points.start + 1, window[1]];
  const move = (part, value) => commit(part, clamp(value, ...bounds(part)));
  const localX = event => {
    const box = track.getBoundingClientRect();
    return (event.clientX - box.left) * width / box.width;
  };
  track.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-endpoint]');
    if (!handle || disabled || grip || event.button !== 0) return;
    const part = handle.dataset.endpoint;
    if (part === anchor) return;
    handle.focus({preventScroll: true});
    handle.setPointerCapture(event.pointerId);
    grip = {part, id: event.pointerId, offset: x(points[part]) - localX(event), near: track.dataset.near === 'true'};
    event.preventDefault();
  });
  track.addEventListener('pointermove', event => {
    if (disabled || grip?.id !== event.pointerId) return;
    move(grip.part, Math.round(window[0] + (localX(event) + grip.offset - INSET) * (window[1] - window[0]) / length()));
  });
  track.addEventListener('pointerup', event => {
    if (!disabled && grip?.id === event.pointerId && suggested[grip.part]) move(grip.part, points[grip.part]);
  });
  track.addEventListener('lostpointercapture', event => {
    if (grip?.id !== event.pointerId) return;
    grip = undefined;
    refresh();
  });
  track.addEventListener('keydown', event => {
    const part = event.target.dataset.endpoint;
    if (!part || part === anchor || disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const [min, max] = bounds(part);
    const moves = {ArrowLeft: points[part] - 1, ArrowDown: points[part] - 1,
      ArrowRight: points[part] + 1, ArrowUp: points[part] + 1, Home: min, End: max};
    if (!Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    move(part, moves[event.key]);
  });
  return {
    dispose: () => observer?.disconnect(),
    update({range, start, end, suggestions, anchor: bound, locked, invalid}) {
      disabled = locked;
      anchor = bound;
      // Keep the scale stable until the user releases the handle or commits typed text.
      if (!grip) window = range;
      const [min, max] = window;
      const valid = value => Number.isFinite(value) && value >= min && value <= max;
      const b = clamp(Number.isFinite(end) ? Math.floor(end) : (suggestions.end ?? max), min + 1, max);
      const a = clamp(Number.isFinite(start) ? Math.floor(start) : (suggestions.start ?? min), min, b - 1);
      points = {start: a, end: b};
      const near = grip ? grip.near : x(b) - x(a) < 24;
      const center = near ? 26 : 17;
      track.dataset.near = String(near);
      track.dataset.invalid = String(invalid);
      track.setAttribute('viewBox', '0 0 ' + width + ' ' + (near ? 54 : 35));
      line.setAttribute('x2', width - INSET);
      line.setAttribute('y1', center);
      line.setAttribute('y2', center);
      for (const part of ENDPOINTS) {
        const handle = handles[part], value = part === 'start' ? start : end;
        const point = points[part], [low, high] = bounds(part);
        const proposed = !valid(value) || Math.floor(value) !== point;
        const y = near ? center + (part === 'start' ? -12 : 12) : center;
        handle.setAttribute('transform', 'translate(' + x(point) + ' ' + y + ')');
        const bound = part === anchor;
        suggested[part] = suggestions[part] !== undefined;
        handle.setAttribute('data-bound', String(bound));
        handle.setAttribute('data-unset', String(!valid(value)));
        handle.setAttribute('aria-disabled', String(disabled || bound));
        handle.setAttribute('tabindex', disabled || bound ? '-1' : '0');
        handle.setAttribute('aria-valuemin', bound ? point : low);
        handle.setAttribute('aria-valuemax', bound ? point : high);
        handle.setAttribute('aria-valuenow', point);
        handle.setAttribute('aria-valuetext', disabled ? '当前不可调整' : bound ?
          part === 'end' ? 'End，跟随视频结尾；可在时间输入框修改' : '00:00，视频起点；可在时间输入框修改' :
          format(point) + (suggested[part] ? '，建议位置，尚未设置' : proposed ? '，尚无可用时间' : ''));
      }
    },
  };
}
