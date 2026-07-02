// Bundled into media/vendor.js — exposes marked + hljs as globals for the webview.
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';

window.marked = marked;
window.hljs = hljs;
