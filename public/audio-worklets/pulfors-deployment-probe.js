// Static-export probe only. The app does not load this module in production.
class PulforsDeploymentProbe extends AudioWorkletProcessor {
  process(_inputs, outputs) {
    for (const channel of outputs[0]) channel.fill(0);
    return true;
  }
}

registerProcessor("pulfors-deployment-probe", PulforsDeploymentProbe);