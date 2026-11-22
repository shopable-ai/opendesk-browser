const previewTimeSuggestion = value => value === null ? '未填写' : '不能采用';

// The preview kit protects its stylesheets. Draw only the timeline geometry here,
// using the existing theme tokens and native SVG, without styles or resources.
class PreviewTimeTrack {
  static left = 35;
  static right = 221;

  constructor(host, {key, name, duration, format, commit}) {
    this.key = key;
    this.duration = duration;
    this.format = format;
    this.commit = commit;
    host.innerHTML = '<svg width="100%" height="36" viewBox="0 0 256 36" preserveAspectRatio="none" role="group" aria-label="' + name + '时间轨道">' +
      '<line x1="35" x2="221" y1="18" y2="18" stroke="var(--od-sub)" stroke-width="2" aria-hidden="true"/>' +
      '<line data-selection y1="18" y2="18" stroke="var(--od-brand)" stroke-width="6" aria-hidden="true"/>' +
      ['start', 'end'].map(field => {
        const start = field === 'start';
        // Each flag occupies its own side of the endpoint, even one second apart.
        const shape = start ? 'M-30 7H-6L0 18L-6 29H-30Q-33 29-33 26V10Q-33 7-30 7Z' :
          'M30 7H6L0 18L6 29H30Q33 29 33 26V10Q33 7 30 7Z';
        return '<g id="vas-slider-' + key + '-' + field + '" role="slider" tabindex="0" data-endpoint="' + field + '" aria-label="' + name + (start ? '开始' : '结束') + '时间" cursor="ew-resize">' +
          '<g aria-hidden="true"><rect x="' + (start ? -33 : 0) + '" y="2" width="33" height="32" fill="transparent"/>' +
          '<path d="' + shape + '" fill="var(--od-paper)" stroke="var(--od-brand)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>' +
          '<text x="' + (start ? -18 : 18) + '" y="18" text-anchor="middle" dominant-baseline="central" font-size="12" fill="var(--od-ink)" pointer-events="none">' + (start ? '始' : '终') + '</text></g></g>';
      }).join('') + '</svg>';
    this.svg = host.querySelector('svg');
    this.selection = host.querySelector('[data-selection]');
    this.handles = Object.fromEntries([...host.querySelectorAll('[data-endpoint]')].map(node => [node.dataset.endpoint, node]));
    this.svg.addEventListener('pointerdown', event => this.grab(event));
    this.svg.addEventListener('pointermove', event => this.drag(event));
    this.svg.addEventListener('lostpointercapture', event => {
      if (this.grip?.id === event.pointerId) this.grip = null;
    });
    // A touch that starts on a flag belongs to the slider; touching elsewhere may scroll.
    this.svg.addEventListener('touchstart', event => {
      if (event.target.closest('[data-endpoint]') && event.cancelable) event.preventDefault();
    }, {passive:false});
    this.svg.addEventListener('keydown', event => this.keydown(event));
    for (const handle of Object.values(this.handles)) {
      const highlight = on => {
        handle.querySelector('path').setAttribute('stroke-width', on ? '3' : '1.5');
        handle.querySelector('path').setAttribute('stroke', on ? 'var(--od-ink)' : 'var(--od-brand)');
      };
      handle.addEventListener('focus', () => highlight(true));
      handle.addEventListener('blur', () => highlight(false));
    }
  }

  update([start, end], issue, reframe) {
    const valid = n => Number.isSafeInteger(n) && n >= 0 && n <= this.duration;
    // A missing or invalid field gets a proposed grip position; it does not write the draft.
    const previous = reframe ? null : this.points;
    const defaultEnd = this.key === 'intro' ? Math.min(30, this.duration) : this.duration;
    const b = valid(end) ? Math.max(end, 1) : previous?.end ?? (valid(start) ? Math.min(start + 30, this.duration) : defaultEnd);
    const a = Math.min(b - 1, valid(start) ? start : previous?.start ?? Math.max(0, b - 30));
    this.points = {start:a, end:b};
    if (!this.window || reframe) {
      const size = Math.min(180, this.duration);
      const padding = Math.max(30, Math.ceil((size - (b - a)) / 2));
      const min = Math.max(0, Math.min(a - padding, this.duration - size));
      this.window = [min, Math.min(this.duration, Math.max(min + size, b + padding))];
    }
    const suggestions = {};
    for (const [field, typed] of [['start', start], ['end', end]]) {
      const grip = this.handles[field], point = this.points[field];
      const [min, max] = this.bounds(field);
      const confirmed = point === typed;
      if (!confirmed) suggestions[field] = previewTimeSuggestion(typed);
      grip.setAttribute('transform', 'translate(' + this.x(point) + ' 0)');
      grip.setAttribute('aria-valuemin', min);
      grip.setAttribute('aria-valuemax', max);
      grip.setAttribute('aria-valuenow', point);
      const label = field === 'start' ? '开始' : '结束';
      grip.setAttribute('aria-valuetext', this.format(point) + (confirmed ? '' : '，建议位置，' + label + '时间' + suggestions[field]));
      grip.setAttribute('aria-describedby', 'vas-track-window-' + this.key + (issue?.fields.includes(field) ? ' vas-error-' + this.key : ''));
      grip.querySelector('path').setAttribute('stroke-dasharray', confirmed ? 'none' : '2 2');
    }
    this.selection.setAttribute('visibility', valid(start) && valid(end) && start < end ? 'visible' : 'hidden');
    this.selection.setAttribute('x1', this.x(a));
    this.selection.setAttribute('x2', this.x(b));
    return suggestions;
  }

  bounds(field) {
    const [min, max] = this.window;
    return field === 'start' ? [min, this.points.end - 1] : [this.points.start + 1, max];
  }
  x(seconds) {
    const [min, max] = this.window;
    const {left, right} = PreviewTimeTrack;
    return left + (right - left) * (seconds - min) / (max - min);
  }
  localX(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(this.svg.getScreenCTM().inverse()).x;
  }
  setPoint(field, next) {
    const [min, max] = this.bounds(field);
    this.commit(field, Math.max(min, Math.min(max, next)));
  }
  grab(event) {
    const handle = event.target.closest('[data-endpoint]');
    if (!handle || event.button !== 0 || this.grip) return;
    const field = handle.dataset.endpoint;
    handle.focus({preventScroll:true});
    handle.setPointerCapture(event.pointerId);
    this.grip = {field, id:event.pointerId, offset:this.x(this.points[field]) - this.localX(event)};
    event.preventDefault();
  }
  drag(event) {
    if (this.grip?.id !== event.pointerId) return;
    const {field, offset} = this.grip;
    const [min, max] = this.window;
    const {left, right} = PreviewTimeTrack;
    this.setPoint(field, Math.round(min + (this.localX(event) + offset - left) * (max - min) / (right - left)));
  }
  keydown(event) {
    const field = event.target.dataset.endpoint;
    if (!field || event.altKey || event.ctrlKey || event.metaKey) return;
    const point = this.points[field], [min, max] = this.bounds(field);
    const moves = {ArrowLeft:point - 1, ArrowDown:point - 1, ArrowRight:point + 1, ArrowUp:point + 1, Home:min, End:max};
    if (!Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    this.setPoint(field, moves[event.key]);
  }
}
