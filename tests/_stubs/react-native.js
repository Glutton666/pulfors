/**
 * Minimal react-native stub for Jest (jsdom).
 *
 * - Platform, StyleSheet, Dimensions: already used by existing tests.
 * - View, Text, ScrollView, Pressable: forward all children to DOM elements
 *   so that @testing-library/react can render and interact with them.
 * - PanResponder: returns empty panHandlers (gesture testing is done separately).
 * - useWindowDimensions: returns a fixed 375×812 viewport.
 */

const React = require("react");
let lastPanResponderConfig = null;

/** Create a simple pass-through component that forwards key RN props to DOM. */
function makeRNComponent(tag) {
  const Comp = React.forwardRef(function RNCompat(
    { children, testID, onPress, onLongPress, style, ...rest },
    ref,
  ) {
    const domProps = { "data-testid": testID, ref };
    if (typeof onPress === "function") domProps.onClick = onPress;
    if (typeof onLongPress === "function") {
      domProps.onContextMenu = function (e) {
        e.preventDefault();
        onLongPress(e);
      };
      // Also expose as a named prop so tests can fire it with fireEvent(el, 'longPress')
      domProps.onLongPress = onLongPress;
    }
    const resolvedChildren =
      typeof children === "function" ? children({ pressed: false }) : children;
    return React.createElement(tag, domProps, resolvedChildren);
  });
  Comp.displayName = tag;
  return Comp;
}

const View = makeRNComponent("div");
const Text = makeRNComponent("span");
const ScrollView = makeRNComponent("div");
const TextInput = makeRNComponent("input");
const ActivityIndicator = makeRNComponent("div");
const Image = makeRNComponent("img");
const Switch = makeRNComponent("input");

// Pressable — renders as a <button>; onPress → onClick, onLongPress → onContextMenu
// (contextMenu is the closest standard DOM event we can fire from tests)
const Pressable = React.forwardRef(function Pressable(
  { children, testID, onPress, onLongPress, style, disabled, hitSlop, delayLongPress, ...rest },
  ref,
) {
  const domProps = { "data-testid": testID, ref, type: "button" };
  if (typeof onPress === "function") domProps.onClick = onPress;
  if (typeof onLongPress === "function") {
    domProps.onContextMenu = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      onLongPress(e);
    };
  }
  const resolvedChildren =
    typeof children === "function" ? children({ pressed: false }) : children;
  return React.createElement("button", domProps, resolvedChildren);
});

module.exports = {
  Platform: { OS: "ios", select: (specifics) => specifics.ios ?? specifics.default },
  StyleSheet: { create: (s) => s, flatten: (s) => s, absoluteFillObject: {} },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  useWindowDimensions: () => ({ width: 375, height: 812 }),
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  Switch,
  Pressable,
  PanResponder: {
    create: (config) => {
      lastPanResponderConfig = config;
      return { panHandlers: {} };
    },
  },
  __getLastPanResponderConfig: () => lastPanResponderConfig,
  // No-ops / minimal shims
  Animated: {
    View,
    Text,
    Value: function(v) { this._v = v; this.addListener = () => {}; },
    timing: () => ({ start: jest.fn() }),
    spring: () => ({ start: jest.fn() }),
    createAnimatedComponent: (C) => C,
  },
  Alert: { alert: jest.fn() },
};
