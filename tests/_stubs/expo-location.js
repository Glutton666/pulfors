const Location = {
  Accuracy: { Balanced: 3, High: 4, Highest: 6, Low: 1, Lowest: 0 },
  requestForegroundPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  getForegroundPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 0, altitude: 0, altitudeAccuracy: 0, heading: 0, speed: 0 }, timestamp: 0 }),
};
module.exports = Location;
module.exports.default = Location;
