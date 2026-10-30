from codex_pro.a2a.models import AgentCard
from codex_pro.agent.tools.a2a_delegate import A2ADelegateTool
from codex_pro.config.schema import Config
from codex_pro.security.tool_policy import tool_policy_decision


def test_agentcard_accepts_capabilities():
    card = AgentCard(
        name="x", description="y", url="http://localhost",
        capabilities=["chat", "search"],
    )
    assert card.capabilities == ["chat", "search"]


def test_capabilities_reach_serialized_skills():
    # Guards against "fake capabilities": configured capability tags must be
    # visible in the serialized agent card (the only path to /.well-known/agent.json).
    d = AgentCard(capabilities=["chat", "search"]).to_dict()
    skill_ids = [s["id"] for s in d["skills"]]
    assert "chat" in skill_ids
    assert "search" in skill_ids
    # `capabilities` key stays the reserved A2A object. streaming is False
    # because the server has no SSE / tasks/sendSubscribe implementation —
    # the card must not over-declare capabilities it cannot honour.
    assert d["capabilities"] == {"streaming": False, "pushNotifications": False}


def test_remote_agent_private_address_access_is_opt_in():
    config = Config.model_validate({
        "a2a": {
            "remote_agents": [
                {"id": "public-peer", "url": "https://agent.example"},
                {"id": "internal-peer", "url": "http://agent.internal", "allow_private": True},
            ]
        }
    })
    peers = {peer.id: peer for peer in config.a2a.remote_agents}
    assert peers["public-peer"].allow_private is False
    assert peers["internal-peer"].allow_private is True


def test_outbound_a2a_still_obeys_network_policy():
    config = Config.model_validate({
        "tools": {"profile": "full"},
        "execution": {"network_policy": "deny"},
    })
    tool = A2ADelegateTool(remote_agents=[{"id": "peer", "url": "https://agent.example"}])
    allowed, reason = tool_policy_decision(config, tool)
    assert allowed is False
    assert "network_policy=deny" in reason
