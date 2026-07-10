import { AutoRouter } from 'itty-router'

const router = AutoRouter()

router.post('/', async (request, env) => {
  const url = new URL(request.url);
  let subject = url.searchParams.get("subject");
  const email = url.searchParams.get("to"); // recipient email
  const name = url.searchParams.get("name"); // recipient name
  const from = url.searchParams.get("from");  // senders name
  const secret = url.searchParams.get("secret"); // used for auth
  const simpleBody = url.searchParams.get("simpleBody")
  const headers = request.headers
  const contentType = headers.get('content-type')
  const format = url.searchParams.get("format") || "text/html"
  if (secret !== env.SECRET) {
    return new Response("unauthorized", { status: 403 });
  } else if (!from || !name || !email) {
    return new Response("missing query", { status: 400 });
  }
  let body, value;

  if (contentType === "application/json") {
    try {
      body = await request.json()
    } catch (err) {
      console.error(err);
    }
  } else {
    body = await request.text()
  }


  // TODO: rework this, this is just a mess
  if (typeof body === "object") {
    if (body["uptime"]) {
      value = body["monitor"] + " is down";
      subject = body["monitor"] + " is down";
    } else {
      value = body
    }
  } else if (simpleBody) {
    value = simpleBody
  } else {
    value = body
  }

  // console.log("sending mail", email, name, from, format, subject)

  const mail = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.API_KEY,
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email, name }]
      }],
      from: {
        email: `mail@codabool.com`,
        name: from,
      },
      content: [{ type: format, value }],
      subject,
    })
  })
  const text = await mail.text()

  // console.log("mailchannels api status code", mail.status)
  if (!mail.ok || mail.status > 399) {
    console.error(`Error sending email: ${mail.status} ${mail.statusText} ${text}`);
    return new Response("not found", { status: 404 });
  }
  return new Response("email sent", { status: 200 });
})

export default { fetch: router.fetch }