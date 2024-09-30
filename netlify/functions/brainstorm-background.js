import { Octokit } from "@octokit/core";

// from github.com/brainstory/prompts
const bsPrompt = `
## Goal

* You are an AI assistant that helps users brainstorm to better express and clarify their ideas.
* You interact through conversation, asking concise, probing questions to help users explore their own ideas.

## Structure of the conversation
* At the beginning of a conversation, you will ask what the user is working on today in order to understand their goal.
  However, a user might already have a goal in mind, in which case feel free to jump right into the conversation.
* Keep your followup questions as brief and concise as you can. Make sure you only ask one question in the followup.
* Always use an interested and empathetic tone with simple, accessible, and engaging vocabulary.
* If the user gives a brief response on a new topic, ask a follow-up question to help H expand on the response which 
  will contribute to their goal.
* If the user gives a short response that indicates they no longer want to discuss this topic or if the topic has already 
  been explored thoroughly in the conversation history, do not ask a follow up question. Instead, provide a recap or an 
  affirmation and then ask what they want to talk about next.

## Guidelines and constraints
* Ensure the conversation always stays focused on developing the user's ideas. Always gently bring the user back to this
  goal if they respond in a way that doesn't align with this goal. If the user tries to initiate any other kind of
  conversation, politely but firmly decline.
* If asked about yourself, you may acknowledge that you are a computer program, but redirect back to the user's story.
* Focus on the user's own perspective and experiences rather than contributing your own knowledge or information.
  Your goal is always to help the user brainstorm and explore their own ideas, never to answer questions or provide
  information.
`;

export async function handler(event, context) {
	try {
		console.log("Received event:", JSON.stringify(event));

		const tokenForUser = event.headers["x-github-token"];
		if (!tokenForUser) {
			console.error("No GitHub token provided");
			return {
				statusCode: 401,
				body: JSON.stringify({ error: "No GitHub token provided" }),
			};
		}

		const octokit = new Octokit({ auth: tokenForUser });

		try {
			const { data: user } = await octokit.request("GET /user");
			console.log("User:", user.login);
		} catch (error) {
			console.error("Error fetching user:", error);
			return {
				statusCode: 401,
				body: JSON.stringify({ error: "Invalid GitHub token" }),
			};
		}

		let payload;
		try {
			payload = JSON.parse(event.body);
			console.log("Payload:", JSON.stringify(payload));
		} catch (error) {
			console.error("Error parsing payload:", error);
			return {
				statusCode: 400,
				body: JSON.stringify({ error: "Invalid payload" }),
			};
		}

		const messages = payload.messages;
		if (!Array.isArray(messages)) {
			console.error("Invalid messages format");
			return {
				statusCode: 400,
				body: JSON.stringify({ error: "Invalid messages format" }),
			};
		}

		messages.unshift({
			role: "system",
			content: bsPrompt,
		});

		const copilotLLMResponse = await fetch(
			"https://api.githubcopilot.com/chat/completions",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${tokenForUser}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					messages,
					stream: false,
				}),
			}
		);

		if (!copilotLLMResponse.ok) {
			console.error("Error from Copilot API:", await copilotLLMResponse.text());
			return {
				statusCode: copilotLLMResponse.status,
				body: JSON.stringify({ error: "Error from Copilot API" }),
			};
		}

		const responseData = await copilotLLMResponse.json();
		console.log("Copilot response:", JSON.stringify(responseData));

		return {
			statusCode: 200,
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(responseData),
		};
	} catch (error) {
		console.error("Unhandled error:", error);
		return {
			statusCode: 500,
			body: JSON.stringify({
				error: "Internal Server Error",
				details: error.message,
			}),
		};
	}
}
