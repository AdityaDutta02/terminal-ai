## graphify

This project has a persistent knowledge graph in `graphify-out/graph.json`.

**Before answering codebase questions:**
- Check `graphify-out/graph.json` exists. If it does, use `/graphify query "<question>"` to traverse the graph first rather than reading source files cold.
- God nodes and community labels in `graphify-out/GRAPH_REPORT.md` give the fastest architectural overview.

**After code changes:**
- If you modified, added, or deleted code files, run `/graphify . --update` to keep the graph current.
- Code-only changes are cheap (AST only, no LLM). Doc/image changes require semantic re-extraction.

**Rebuilding from scratch:**
- Run `/graphify .` to rebuild the full graph.
