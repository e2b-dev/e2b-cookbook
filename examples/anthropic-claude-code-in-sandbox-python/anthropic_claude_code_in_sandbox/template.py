from e2b import Template

template_name = 'anthropic-claude-code'
template = (
    Template().
    from_node_image("24").
    run_cmd("npm install -g @anthropic-ai/claude-code")
)