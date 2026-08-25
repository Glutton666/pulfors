const React = require("react");
const { View } = require("react-native");

/**
 * The native masked-view package ships ESM that Jest does not transform.
 * GradientLetter only needs a transparent test wrapper around its children.
 */
const MaskedView = React.forwardRef(function MaskedView(
  { children, ...props },
  ref,
) {
  return React.createElement(View, { ...props, ref }, children);
});

module.exports = MaskedView;
module.exports.default = MaskedView;