import {
  createElement,
  BrainCircuit,
  FlaskConical,
  ScanSearch,
  FileCheck,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Compass,
  Sprout,
  Play,
  Check,
  Lock,
} from 'lucide';

const ICON_MAP = {
  'brain-circuit': BrainCircuit,
  'flask-conical': FlaskConical,
  'scan-search': ScanSearch,
  'file-check': FileCheck,
  'message-circle': MessageCircle,
  'notebook-pen': NotebookPen,
  'shield-check': ShieldCheck,
  compass: Compass,
  sprout: Sprout,
  play: Play,
  check: Check,
  lock: Lock,
};

/**
 * Mount Lucide SVG icons into elements with a `data-icon` attribute.
 * Example: <span class="mini-icon" data-icon="brain-circuit"></span>
 */
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const Icon = ICON_MAP[name];
    if (!Icon) {
      console.warn(`Unknown icon: ${name}`);
      return;
    }

    const size = Number(el.dataset.iconSize) || 16;
    const strokeWidth = Number(el.dataset.iconStroke) || 2;

    el.replaceChildren(
      createElement(Icon, {
        width: size,
        height: size,
        strokeWidth,
        'aria-hidden': 'true',
      }),
    );
  });
}
