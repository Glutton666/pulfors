module.exports = {
  requestMediaLibraryPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: "Images" },
};
