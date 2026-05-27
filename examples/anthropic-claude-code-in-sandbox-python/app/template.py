from e2b import Template

template_name = "anthropic-claude-code"
template = (
    Template().from_node_image("24").npm_install("@anthropic-ai/claude-code", g=True)
)
