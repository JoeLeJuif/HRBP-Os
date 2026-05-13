// Boot shim + mount, extracted from index.html so the CSP can drop
// 'unsafe-inline' from script-src. Loaded BEFORE /app.js so the require()
// shim is in place when the IIFE bundle resolves its react/react-dom
// externals. Mount runs on DOMContentLoaded, which fires only after all
// synchronous body scripts (including /app.js) have executed, so
// window.HRBPOSApp is guaranteed to exist by then.

window.require = function (mod) {
  if (mod === 'react') return React;
  if (mod === 'react-dom') return ReactDOM;
  throw new Error('Cannot require ' + mod);
};

document.addEventListener('DOMContentLoaded', function () {
  var App = HRBPOSApp.default;
  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
});
