let url = null;
let ws = null;
let datacenters = null;
let configurations = null;

window.addEventListener("load", () => {
	// Ready Check
	readyCheck();

	// Websocket URL
	url = new URL("/websocket", window.location.href);
	url.protocol = "ws:";

	// Websocket
	ws = new WebSocket(url.href);
	SetupWebSocket();

	// Event listeners
	let configDropdown = document.getElementById("configDropdown");
	configDropdown.addEventListener("change", async (ev) => {
		let table = document.getElementById("datacenterFiller");
		[...document.getElementsByClassName("datacenterPing")].forEach(c => c.remove());

		let curConfig = document.getElementById("curConfig");
		curConfig.innerText = "";

		if (ev.srcElement.options.selectedIndex < 0 || ev.srcElement.options.selectedIndex >= ev.srcElement.options.length) {
			return;
		}

		if (typeof configurations[ev.srcElement.options.selectedIndex] === "undefined") {
			return;
		}

		// Wait until "datacenters" is filled up
		while (datacenters === null) {
			await new Promise(p => setTimeout(p, 100));
		}

		curConfig.innerText = configurations[ev.srcElement.options.selectedIndex].name;

		for (let ping of configurations[ev.srcElement.options.selectedIndex].pings) {
			let datacenter = datacenters.filter(d => d.short === ping.name);

			let tr = document.createElement("tr");
			tr.classList.add("datacenterPing");

			let td1 = document.createElement("td");
			td1.innerText = datacenter.length >= 1 ? datacenter[0].desc : ping.name;

			let td2 = document.createElement("td");
			let input = document.createElement("input");
			input.type = "number";
			input.size = "1";
			input.max = "999";
			input.min = "1";
			input.value = ping.ping ? ping.ping.toString() : "5";

			td2.appendChild(input);

			tr.appendChild(td1);
			tr.appendChild(td2);

			table.appendChild(tr);
		}
	});

	let newConfig = document.getElementById("newConfig");
	newConfig.addEventListener("click", (ev) => {
		let name = window.prompt("Give your config a name! Valid Characters: A-Z a-z 0-9 _ -");
		if (name === null) {
			return;
		}

		if (/^[A-Za-z0-9_\-]+$/.test(name) === false) {
			window.alert("Invalid config name. Valid Characters: A-Z a-z 0-9 _ -");
			return;
		}

		if (ws === null) {
			window.alert("Connection to backend has been lost. Please reload the page.");
			return;
		}

		ws.send(JSON.stringify({
			type: "createConfig",
			data: name
		}));
	});

	let deleteConfig = document.getElementById("deleteConfig");
	deleteConfig.addEventListener("click", (ev) => {
		if (configDropdown.options.selectedIndex < 0 || configDropdown.options.selectedIndex >= configDropdown.options.length) {
			return;
		}

		if (typeof configurations[configDropdown.options.selectedIndex] === "undefined") {
			return;
		}

		let res = window.confirm("Are you sure you want to delete " + configurations[configDropdown.options.selectedIndex].name + "?");
		if (res !== true) {
			return;
		}

		ws.send(JSON.stringify({
			type: "deleteConfig",
			data: configurations[configDropdown.options.selectedIndex].name
		}));
	});

	let saveConfig = document.getElementById("saveConfig");
	saveConfig.addEventListener("click", (ev) => {
		if (configDropdown.options.selectedIndex < 0 || configDropdown.options.selectedIndex >= configDropdown.options.length) {
			return;
		}

		if (typeof configurations[configDropdown.options.selectedIndex] === "undefined") {
			return;
		}

		ws.send(JSON.stringify({
			type: "saveConfig",
			data: {
				name: configurations[configDropdown.options.selectedIndex].name,
				pings: [...document.getElementsByClassName("datacenterPing")].map((m) => {
					let name = datacenters.filter(d => d.desc === m.children[0].innerText);
					let ping = parseInt(m.children[1].children[0].value);

					return {
						name: name.length > 0 ? name[0].short : undefined,
						ping: ping
					}
				}).filter(d => typeof d.name === "string")
			}
		}));
	});

	let queueButton = document.getElementById("queueButton");
	queueButton.addEventListener("click", (ev) => {
		if (ev.srcElement.innerText.includes("Stop") === true) {
			ws.send(JSON.stringify({
				type: "stopQueue",
				data: {}
			}));
			return;
		}

		if (configDropdown.options.selectedIndex < 0 || configDropdown.options.selectedIndex >= configDropdown.options.length) {
			return;
		}

		if (typeof configurations[configDropdown.options.selectedIndex] === "undefined") {
			return;
		}

		[...document.getElementsByClassName("outputFiller")].forEach(c => c.remove());

		ev.srcElement.innerText = "Stop Queue";

		ws.send(JSON.stringify({
			type: "startQueue",
			data: {
				configurations: configurations[configDropdown.options.selectedIndex].name
			}
		}));
	});
});

async function readyCheck() {
	while (datacenters === null || configurations === null) {
		await new Promise(p => setTimeout(p, 100));
	}

	let table = document.getElementById("outputFiller");

	let tr = document.createElement("tr");
	tr.classList.add("outputFiller");

	let td = document.createElement("td");
	td.innerText = "Successfully Initialized";

	tr.appendChild(td);
	table.appendChild(tr);
}

function SetupWebSocket() {
	ws.addEventListener("open", () => {
		console.log("Successfully established backend connection.");
	});
	ws.addEventListener("message", (message) => {
		let json = undefined;
		try {
			json = JSON.parse(message.data);
		} catch (e) { };

		if (json === undefined) {
			console.log(message.data);
			return;
		}

		switch (json.type) {
			case "network":
				datacenters = json.data;
				break;
			case "configurations":
				let configDropdown = document.getElementById("configDropdown");
				[...configDropdown.children].forEach(c => c.remove());

				configurations = json.data;

				for (let config of json.data) {
					let option = document.createElement("option");
					option.value = config.name;
					option.innerText = config.name;

					configDropdown.appendChild(option);
				}

				configDropdown.options.selectedIndex = -1;

				let event = new Event("change");
				configDropdown.dispatchEvent(event);
				break;
			case "createConfig":
			case "deleteConfig":
			case "saveConfig":
			case "stopQueue":
				window.alert(json.data);
				break;
			case "startQueue":
				let table = document.getElementById("outputFiller");

				let tr = document.createElement("tr");
				tr.classList.add("outputFiller");

				let td = document.createElement("td");
				td.innerHTML = new Date(json.data.date).toLocaleTimeString("en-US", {
					hour12: false,
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit"
				}) + ": " + json.data.text;

				tr.appendChild(td);
				table.appendChild(tr);
				break;
			case "endQueue":
				let queueButton = document.getElementById("queueButton");
				queueButton.innerText = "Start Queue";
				break;
			default:
				console.log(json);
				break;
		}
	});
	ws.addEventListener("error", (err) => {
		console.error(err);
	});
	ws.addEventListener("close", async () => {
		ws = null;

		console.log("Lost connection to backend. Reconnecting in 10 seconds...");
		await new Promise(r => setTimeout(r, 10000));

		ws = new WebSocket(url.href);
		SetupWebSocket();
	});
}
