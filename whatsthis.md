# 🏗️ Hackathon Project Plan — Claude Build

## Project Overview

**Project Name:**

What's This?

**One-Liner:**

A browser plugin to learn more about the people, places, and things you encounter while browsing the web.

**Problem Statement:**

Learning more about concepts on a page of the web requires you to shift out of your context and focus to pull up another window or tab, resulting in clutter and sometimes losing your train of thought, instead of staying focused on what it is you're reading or viewing right now.

**Target User:**

Broad target audience. For people who are curious-minded and lifelong learned who see their web browsing as an opportunity to learn more about the world.

## Core Functionality

**Must-Have Features (MVP):**

1. Select a block of text (as little as one word) or an image and get more information about whatever it is you select
2. Stay in context - the information you receive back from the Anthropic API is a pop-over within the page you're on, not requiring you to open another tab or wab to search for the information you're looking for.
3. Easy installation as a Chrome browser plugin

**Nice-to-Have Features (Stretch Goals):**

1. Option to change between various Anthropic API LLM models - speed vs. depth
2. Support for selecting a video
3. Ability for multiple "What's This?" queries to be on the same page but about different content. 
4. A history of past information you can pull up - no need to bookmark because it saved the URL where you asked for more information and the information you asked for together in one viewable place

**Demo Script:**

1. Explain the concept, the problem statement, and why I built this due to my own needs and others.
2. Explain the technology - it's a Chrome browser plugin powered by Anthropic API (other browoers, such as Safari as a future phase).
3. Show examples of text, photo, and video use cases.

## Technical Approach

**How Claude Is Used:**

I'm using Claude Code to build the browser plug-in and the Anthropic API to power the knowledge queries. When a user selects text, image, or video, and selects "What's This?", then the Anthropic API will retrieve the information requested. If there is more than a few seconds of wait time, we want to start with the fastest model to fill in the initial details and then switch to a more advance and slower model to augmented the information as a follow-up.

**Claude Features / Capabilities to Leverage:**

The users selects text, image, or video, and either through right-click or a keyboard option or some other mechanism indicates "What's This?" and then the query is sent off via the Anthropic API to retried more context and information about whatever was selected. If there's any ambiguity about what was selected and what specifically hte user wants to know more aobut, Claude can send back a question as a follow-up to provide more precise information. In additionl, teh user can choose to learn even more or enter in clarifying information to send back to help with follow-up queries.

The user will be able to do this entirely without leaving the page they are on. The information will be display in a appropriated-sized popover connected to the content they want to learn more about.

**Tech Stack:**

Chrome Browser plugin - ideally cross-platform for at least Mac and Windows, ideally Linux, as well. If this is technically challenging, get it working on Mac first as that's what I'll be demoing on.

I have no preference on a programing language. I'm guessing some are better suited for Chrome plugins than opthers. Given a choice, I'd prefer either JavaScript/Typescript or Python, but if there's a better choice here, I'm open.

The goal would be to do this with no cloud infrastructure at all, if possible. The client code would be a browser plugin and with the Anthropic API key built in for now, and then the direct clal to Claude. If we ned to store history of past queries, ideally store locally on the computer for simplicity.

No login at this time.

No need to deploy to Vercel, ideally. If a cloud deployment is unavoidable, we can use Vercel and/or Supabase and/or any other services you'd recommend.

**Integration Method:**

Browser plugin integrated into the Chrome browser
Anthropic API key.

## Key Prompts & Instructions

**System Prompt (Draft):**

```The user would like more information on the text/image/video they have provided. Focus on an a quick response first, followed by a more detailed response. Yuo can ask the user clarifying queations if necessary, and the user always has the option to send along more information to you to retrieve related to the intial query. Don't let the user wander infinitely away from teh initial query. It needs to be relevant to what the user initial wanted to learn more about.```

**Example User Input → Expected Output:**

Example #1: A single word. This would provide back a definition of the word, links to any associated Wikipedia articles aobut this work, and a prompt to ask for any more follow-up about this word. This will need to send the word to the Anthropic API. Ideally it will send a larger block of text behind the scenes so in case a vague word like 'set' is sent, Claude knows the context of the word in this case.

Example #2: Multiple words, a sentence fragment, a sentence, or a larger block of text. This would provide an attempt to infer what the user is wanting to learn more about in the selected block of text - Claude would need to do the inference here, and a prompt to ask for any more follow-up about this block of text. Ideally it will send a larger block of text behind the scenes so in case a vague block of text is sent, Claude knows the context of the block of text in this case.

Example #3: A single image, if the user's cursor if over a speific part of the image, end along where the cursor was to highlight the specific part of the image with the larger image. Also provide information about the image as a whole, and a prompt to ask for any more follow-up about this image. This will need to send the image or the URL to the image to the Anthropic API. It might also send text of the page or text around the image to provide more context relating to the image. 

Example #4: A video file for a duration of time as frames. This might need to be selctive frames in aperiod of time for efficiency. It should also send the URL of the page and URL of the video file for analysis. Video is a stretch goal.

| User Input | Expected Claude Output |
|---|---|
|Text|Text and or images and or additional prompts to inform the user|
|Image|Text and or images and or additional prompts to inform the user|
|Video|Text and or images and or additional prompts to inform the user|

## Constraints & Requirements

**Time Budget:**

Planning: This document is my plan plus whatever tine Claude Code needs to analyze my plan, asking clarifying questions, and building an implemeneted plan from it.

Building: Three hours. Don't let this constrain you, though, because you as Claude Code will code much faster than a human, so features you scope as multiple days or weeks, are general accomplishable in minutes or hours.

Testing/Polish: I'll do this iteratively as Claude Code is building features.

Demo Prep: After teh three hour coding is done, there will be at leasr 45 minutes to prepare a demo.

**Known Limitations or Risks:**

Don't waste time trying to submit this browser plugin to Google to list in the plugin store. Try to avoid getting certifcates from Google to just run the demo on my own computer and maybe the computer of the hackathon judges. We can use this locally for now if need be. Ideally this can be in a form that a Hackathon judge can install on their own computer with some simple instructions.

I don't know what the best user interface option is for selecting. Is it just as simple as highlight text or linger the cursor on an image or video, do we implement a right click menu option in Chrome? Do we hover and then do a keyboard command? I need some advice here.

The video analysys may be a bigger challenge. Thankfully, video support is optional. It doesn't have to be frame-based if I can pass a video URL to Claude and let it "watch" a video.

I'll be working on two projects at once in two windows, so I my time shifting will add some possible short delays as I switch between two Claude Code windows during the three hours.

**Judging Criteria (if known):**

Four things, weighted equally:

1. Use of Claude — Is Claude central to what you built, or just bolted on?
2. Does it work? — Can you demo a functioning product end-to-end?
3. Creativity — Is the idea original? Is the problem worth solving?
4. Demo & Presentation — Can you make us care about it in 3 minutes?

## Team & Roles

**Team Members:**

Me, Raven Zachary, and Claude Code. That's it. No human team, just a solor human and Claude Code.

## Resources & References

Beware of old content on the Internet about how to mahe a Chrome Extension - standard have changed. Don't rely on any sources older than 2-3 years. Prioritize newer sources. Also prioritize the MCPs and the Google URLs where the actual specifications are hosted.

**Useful Links:**

MCPs: https://context7.com/?q=chrome+extension

https://developer.chrome.com/docs/extensions/get-
started

https://ewaldbenes.com/en/blog/my-first-chrome-extension

https://gcdi.commons.gc.cuny.edu/2025/03/28/lets-build-a-browser-extension/

https://www.freecodecamp.org/news/building-chrome-extension/

https://medium.com/@vamsikrishnapapana/cooking-up-your-personalized-chrome-extension-a-guided-recipe-5ff10b7f1b19

https://github.com/guocaoyi/create-chrome-ext

https://github.com/JohnBra/vite-web-extension

https://www.plasmo.com

https://github.com/wxt-dev/wxt/discussions/782

https://github.com/dojoVader/TwitterTAG

**Existing Code or Assets:**

I'm intentionally not starting with any code. This is a Hackathon and I want the entire building process to take place at the Hackathon.

## First Task for Claude

**When you're ready to build, tell Claude exactly what to do first.**

Review this document. Ask a series of clarifying questions one at a time. Create a detailed project plan and proceed with the project.