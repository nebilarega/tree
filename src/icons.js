import {
  createElement,
  Keyboard,
  Cog,
  Boxes,
  Zap,
  Users,
  Target,
  Cloud,
  Shield,
  Play,
  Check,
  Lock,
  Layers,
  Bot,
  Search,
  Rocket,
  Package,
} from 'lucide';

const ICON_MAP = {
  keyboard: Keyboard,
  cog: Cog,
  boxes: Boxes,
  zap: Zap,
  users: Users,
  target: Target,
  cloud: Cloud,
  shield: Shield,
  play: Play,
  check: Check,
  lock: Lock,
  layers: Layers,
  bot: Bot,
  search: Search,
  rocket: Rocket,
  package: Package,
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
