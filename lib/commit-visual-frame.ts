import { unstable_batchedUpdates } from "react-native";

export function commitVisualFrame(commit: () => void) {
  unstable_batchedUpdates(commit);
}