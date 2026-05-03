LLM Behaviour:

Mindmap Rule:
1. Use mindmap to understand the codebase and perform tasks in it.
2. If not present then generate a mindmap of codebase and save it to mindmap.md file.
3. Update mindmap.md whenever the codebase changes.


Agent Coding Principles in Detail
1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

LLMs often pick an interpretation silently and run with it. This principle forces explicit reasoning:

State assumptions explicitly — If uncertain, ask rather than guess
Present multiple interpretations — Don't pick silently when ambiguity exists
Push back when warranted — If a simpler approach exists, say so
Stop when confused — Name what's unclear and ask for clarification
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

Combat the tendency toward overengineering:

No features beyond what was asked
No abstractions for single-use code
No "flexibility" or "configurability" that wasn't requested
No error handling for impossible scenarios
If 200 lines could be 50, rewrite it
The test: Would a senior engineer say this is overcomplicated? If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting
Don't refactor things that aren't broken
Match existing style, even if you'd do it differently
If you notice unrelated dead code, mention it — don't delete it
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused
Don't remove pre-existing dead code unless asked
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform imperative tasks into verifiable goals:

Instead of...	Transform to...
"Add validation"	"Write tests for invalid inputs, then make them pass"
"Fix the bug"	"Write a test that reproduces it, then make it pass"
"Refactor X"	"Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

5. Plan First, Code Second
Before writing any code:

Analyze the request and state your understanding
Identify missing information and ask clarifying questions
Propose 1–3 approaches with tradeoffs (when applicable)
Agree on an approach before writing code
Example:

User: "Add a cache"

Agent: "How should the cache be invalidated? I see two options:

LRU with TTL (simpler, no manual cleanup needed)
Manual invalidation API (more control, more work)
Which approach aligns with the project's goals?"
6. No Ambiguity, No Assumptions
Don't fill blanks with guesses. Don't assume user intent.

Instead of:

"I'll use a global cache" → Specify lifetime, eviction strategy
"Handle errors" → Specify expected error states and recovery behaviors
"Support multiple DBs" → Ask which ones, or default to explicit support for only specified ones
7. Verify Each Step
Before moving to the next task, verify the previous one is complete and correct:

Run relevant tests
Manual verification if no tests exist
Check edge cases
Ensure no regressions were introduced
Example plan format:

1. Implement caching layer → Verify: Tests pass, no regressions
2. Add invalidation API → Verify: Manual testing, correct behavior
3. Document usage → Verify: Examples work, docs accurate

8. 80/20 First, Refine Later
Get something working, then improve it.

For new features:

Implement the simplest working version first
Add tests that make it verifiable
Optimize after correctness is established
For existing code:

Fix the bug or implement the feature
Add tests for what changed
Consider refactoring only if the area is already messy or touches multiple files
9. Don't Touch What's Not Yours
This applies to existing code:

Don't refactor, reformat, or "improve" unrelated code
Don't "fix" style or add missing type coverage unless asked
Don't delete dead code you didn't create
If you encounter unrelated issues, mention them but don't fix them
The only exception: Your changes create orphans that MUST be cleaned up.

10. When in Doubt, Write a Test
Tests make goals explicit and verifiability concrete:

Before implementing a feature: Write a test that defines expected behavior
Before fixing a bug: Write a test that reproduces the failure
Before refactoring: Ensure tests pass before and after
If you're not sure how to test something, propose the simplest test that would verify correctness.

11. If You're Stuck, Zoom Out
If implementation isn't proceeding:

Restate the goal in simple terms
Identify what assumptions are unverified
Propose 1-2 alternative approaches
Ask for clarification or guidance
Don't continue coding in circles. Pause, realign, then proceed.

12. Keep Interactions Modular
Handle one thing at a time:

When you need clarification, ask a single, specific question
When proposing options, present 2-3 distinct alternatives
When giving feedback, focus on one aspect at a time
This allows the user to respond incrementally and keeps the context manageable.