# TODO:

- re-embedding on file change isn't working, just on switching files?
- embed on first loading also doesn't work?
- add text generation feature


## Notes toward a text generation feature:
This could be even more basic than Personate: you have 
- a corpus of notes, 
- a method of getting nearest-neighbors, and 
- a LLM API. 

With those I can create a custom prompt and send it to the completion API. 

I can follow the Github Copilot model and create a text generator with suggestions at your fingertips. (Don't actually know how possible this is in Obsidian but it would be the ideal)

The MVP for this project is a userspace command that generates text with a context-aware prompt. 

Necessary settings:
- prompt template (editable? multiple choice?)
- maximum length of completion
- temperature
- model

Necessary UI:
- button to activate
- command to activate
- display feedback to user

Necessary functionality:
- function to send prompt to API
- function to get context from recent files
- function to compose a template into a prompt
- function to get context from the page
- FIM insertion, suffixing vs open-ended completion
- stopwords 

Future stuff:
- filter outputs and regenerate
- get "best of n" output
- streaming results
- use editing mode
- use autocomplete/suggestions? ghosttext?
- filter for bad prompts