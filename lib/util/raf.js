let raf;

/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function') {
  raf = {
    next: function (x) { return requestAnimationFrame(x) },
    cancel: function (x) { return cancelAnimationFrame(x) }
  }
} else {
  raf = {
    next: function (cb) {
      return setTimeout(cb, 16)
    },
    cancel: clearTimeout
  }
}

export default raf;
