// Configuration
const config = require("./config.json");

// Modules
const express = require("express");
const expressWs = require("express-ws");
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
const Helper = require("./helpers/Helper.js");

// Instances
const server = express();
const ws = expressWs(server);
let processMessages = [];
let process = null;
let haveMatch = false;

// Middlewares
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Utility Routes
server.get(/\w+\.(css|js|png|ico|svg|json)$/, (req, res) => {
	let match = req._parsedUrl.path.split("/").pop().match(/^\w+\.(css|js|png|ico|svg|json)$/);
	if (match.length < 2) {
		res.redirect("/");
		return;
	}

	let filePath = path.join(__dirname, "public", [ "png", "ico", "svg" ].includes(match[1]) ? "images" : match[1], match[0]);
	if (fs.existsSync(filePath) === false) {
		res.sendStatus(404);
		res.end();
		return;
	}

	res.sendFile(filePath);
});

// Websocket
server.ws("/websocket", async (ws, req) => {
	// Send current datacenter list
	let network = await Helper.GetNetworkConfig();
	ws.send(JSON.stringify({
		type: "network",
		data: Object.keys(network.pops).map((m) => {
			return {
				short: m,
				desc: network.pops[m].desc
			}
		}).filter(m => typeof m.desc === "string")
	}));

	// Send current configurations
	let files = fs.readdirSync(path.join(__dirname, "config", "datagram"));
	ws.send(JSON.stringify({
		type: "configurations",
		data: files.map((m) => {
			let json = Helper.ParseCustomNetworkPings(path.join(__dirname, "config", "datagram", m));

			return {
				name: m.split(".").shift(),
				pings: json
			}
		})
	}));

	ws.on("message", (message) => {
		let json = undefined;
		try {
			json = JSON.parse(message);
		} catch(e) {};

		if (json === undefined) {
			console.log(message);
			return;
		}

		let files = null;
		let filePath = null;

		switch (json.type) {
			case "createConfig":
				if (/^[A-Za-z0-9_\-]+$/.test(json.data) === false) {
					ws.send(JSON.stringify({
						type: "createConfig",
						data: "Invalid config name. Valid Characters: A-Z a-z 0-9 _ -"
					}));
					return;
				}

				fs.copyFileSync(path.join(__dirname, "config", "datagram", "default.txt"), path.join(__dirname, "config", "datagram", json.data + ".txt"));

				files = fs.readdirSync(path.join(__dirname, "config", "datagram"));
				ws.send(JSON.stringify({
					type: "configurations",
					data: files.map((m) => {
						let json = Helper.ParseCustomNetworkPings(path.join(__dirname, "config", "datagram", m));

						return {
							name: m.split(".").shift(),
							pings: json
						}
					})
				}));
				break;
			case "deleteConfig":
				filePath = path.join(__dirname, "config", "datagram", json.data + ".txt");
				if (fs.existsSync(filePath) === false) {
					ws.send(JSON.stringify({
						type: "deleteConfig",
						data: "Failed to delete config. Config does not exist."
					}));
					return;
				}

				if (json.data === "default") {
					ws.send(JSON.stringify({
						type: "saveConfig",
						data: "Failed to delete config. You cannot override the default configuration."
					}));
					return;
				}

				fs.unlinkSync(filePath);

				files = fs.readdirSync(path.join(__dirname, "config", "datagram"));
				ws.send(JSON.stringify({
					type: "configurations",
					data: files.map((m) => {
						let json = Helper.ParseCustomNetworkPings(path.join(__dirname, "config", "datagram", m));

						return {
							name: m.split(".").shift(),
							pings: json
						}
					})
				}));
				break;
			case "saveConfig":
				filePath = path.join(__dirname, "config", "datagram", json.data.name + ".txt");
				if (fs.existsSync(filePath) === false) {
					ws.send(JSON.stringify({
						type: "saveConfig",
						data: "Failed to save config. Config does not exist."
					}));
					return;
				}

				if (json.data.name === "default") {
					ws.send(JSON.stringify({
						type: "saveConfig",
						data: "Failed to save config. You cannot override the default configuration."
					}));
					return;
				}

				fs.writeFileSync(filePath, json.data.pings.map(d => d.name + " " + d.ping + " 1").join("\n"));

				files = fs.readdirSync(path.join(__dirname, "config", "datagram"));
				ws.send(JSON.stringify({
					type: "configurations",
					data: files.map((m) => {
						let json = Helper.ParseCustomNetworkPings(path.join(__dirname, "config", "datagram", m));

						return {
							name: m.split(".").shift(),
							pings: json
						}
					})
				}));

				ws.send(JSON.stringify({
					type: "saveConfig",
					data: "Config saved successfully"
				}));
				break;
			case "startQueue":
				filePath = path.join(__dirname, "config", "datagram", json.data.configurations + ".txt");
				if (fs.existsSync(filePath) === false) {
					ws.send(JSON.stringify({
						type: "startQueue",
						data: "Failed to start queue. Config does not exist."
					}));
					return;
				}

				ws.send(JSON.stringify({
					type: "startQueue",
					data: {
						date: new Date(),
						text: "Logging into Steam..."
					}
				}));

				process = childProcess.fork(path.join(__dirname, "src", "index.js"), [
					filePath
				], {
					cwd: path.join(__dirname, "src"),
					execArgv: [
						"--inspect"
					]
				});

				process.on("error", console.error);

				process.on("message", async (msg) => {
					processMessages.push(Array.isArray(msg) ? msg.join("<br>") : msg.toString());

					if (processMessages.length > 1) {
						return;
					}

					while (processMessages.length >= 1) {
						// Parse message
						if (processMessages[0].includes("IP: ") === true) {
							let parts = processMessages[0].split("<br>").filter(p => p.startsWith("IP: "));
							if (parts.length > 0) {
								haveMatch = true;

								let server = (await Helper.GetServerInfo(config.steamWebAPIKey, parts.shift().split(" ").pop())).shift();
								if (typeof server === "object") {
									let m = processMessages[0].split("<br>");

									if (server.specport > 0) {
										m.splice(1, 0, "SourceTV Port: " + server.specport);
									}

									if (typeof server.message === "string") {
										m.splice(m.length - 1, 0, "Valve Message: " + server.message);
									}

									processMessages[0] = "<br>" + m.join("<br>");
								}
							}
						}

						// Send to client
						ws.send(JSON.stringify({
							type: "startQueue",
							data: {
								date: new Date(),
								text: processMessages.shift().replace("\n", "<br>")
							}
						}));
					}
				});

				process.on("exit", (code, signal) => {
					ws.send(JSON.stringify({
						type: "endQueue",
						data: {}
					}));

					haveMatch = false;
					currentlyInQueueForUser = "0";
					process = null;

					if (signal === "SIGTERM"  && code === null) {
						ws.send(JSON.stringify({
							type: "startQueue",
							data: {
								date: new Date(),
								text: "Successfully terminated queue"
							}
						}));
						return;
					}

					if (code === 0) {
						return;
					}

					ws.send(JSON.stringify({
						type: "startQueue",
						data: {
							date: new Date(),
							text: "Child process exited with signal " + signal + " and exit code " + code
						}
					}));
				});
				break;
			case "stopQueue":
				if (process === null) {
					ws.send(JSON.stringify({
						type: "stopQueue",
						data: "Failed to cancel queue. Not queueing."
					}));
					return;
				}

				if (haveMatch === true) {
					ws.send(JSON.stringify({
						type: "stopQueue",
						data: "You already have been assigned to a match. The process will automatically quit in ~5 seconds."
					}));
					return;
				}

				process.kill();
				break;
			default:
				console.log(json);
				break;
		}
	});
});

// Routes
server.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "html", "index.html"));
});

// Redirect
server.all("*", (req, res) => {
	res.redirect("/");
});

server.listen(config.port, () => {
	console.log("Listening on " + config.port);
});
