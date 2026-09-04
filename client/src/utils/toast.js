import hotToast, { Toaster } from "react-hot-toast";

// Single source of truth for how long a toast stays on screen.
// Change this value to adjust the duration app-wide.
const TOAST_DURATION = 2000;

// Only one toast should ever be visible at a time: firing a new one
// immediately dismisses whatever is currently showing instead of
// queueing/stacking behind it.
function call(fn, message, options) {
  hotToast.dismiss();
  fn(message, { ...options, duration: TOAST_DURATION });
}

const toast = (message, options) => call(hotToast, message, options);
toast.success = (message, options) => call(hotToast.success, message, options);
toast.error = (message, options) => call(hotToast.error, message, options);
toast.loading = (message, options) => call(hotToast.loading, message, options);
toast.custom = (message, options) => call(hotToast.custom, message, options);

toast.dismiss = (...args) => hotToast.dismiss(...args);
toast.remove = (...args) => hotToast.remove(...args);

export default toast;
export { Toaster };
