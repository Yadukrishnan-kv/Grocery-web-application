import hotToast, { Toaster } from "react-hot-toast";

// Single source of truth for how long a toast stays on screen.
// Change this value to adjust the duration app-wide.
const TOAST_DURATION = 2000;
// react-hot-toast's default exit transition; give it time to finish
// before the next queued toast is allowed to appear.
const EXIT_ANIMATION_MS = 300;

const queue = [];
let activeTimer = null;

function runNext() {
  if (activeTimer || queue.length === 0) return;

  const { render } = queue.shift();
  render();

  activeTimer = setTimeout(() => {
    activeTimer = null;
    runNext();
  }, TOAST_DURATION + EXIT_ANIMATION_MS);
}

function enqueue(render) {
  queue.push({ render });
  runNext();
}

function call(fn, message, options) {
  enqueue(() => {
    hotToast.dismiss();
    fn(message, { ...options, duration: TOAST_DURATION });
  });
}

const toast = (message, options) => call(hotToast, message, options);
toast.success = (message, options) => call(hotToast.success, message, options);
toast.error = (message, options) => call(hotToast.error, message, options);
toast.loading = (message, options) => call(hotToast.loading, message, options);
toast.custom = (message, options) => call(hotToast.custom, message, options);

toast.dismiss = (...args) => {
  queue.length = 0;
  clearTimeout(activeTimer);
  activeTimer = null;
  hotToast.dismiss(...args);
};
toast.remove = (...args) => hotToast.remove(...args);

export default toast;
export { Toaster };
