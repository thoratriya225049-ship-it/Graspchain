import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/** Deploys AssessmentRegistry owned by the deploying account (the chain writer's key). */
export default buildModule("AssessmentRegistryModule", (m) => {
  const owner = m.getParameter("owner", m.getAccount(0));
  const registry = m.contract("AssessmentRegistry", [owner]);
  return { registry };
});
