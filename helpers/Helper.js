const request = require("request");
const fs = require("fs");

module.exports = class Helper {
	static GetServerInfo(apikey, addr) {
		return new Promise((resolve, reject) => {
			request("https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/?key=" + apikey + "&addr=" + addr, (err, res, body) => {
				if (err) {
					reject(err);
					return;
				}

				let json = undefined;
				try {
					json = JSON.parse(body);
				} catch(e) {};

				if (json === undefined) {
					reject(body);
					return;
				}

				if (typeof json.response === "undefined" || json.response.success !== true) {
					reject(json);
					return;
				}

				resolve(json.response.servers);
			})
		});
	}

	static GetNetworkConfig(url = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-TF2/master/platform/config/network_config.json") {
		return new Promise((resolve, reject) => {
			request(url, (err, res, body) => {
				if (err) {
					reject(err);
					return;
				}

				let json = undefined;
				try {
					json = JSON.parse(body);
				} catch(e) {};

				if (json === undefined) {
					reject(body);
					return;
				}

				resolve(json);
			});
		});
	}

	static ParseCustomNetworkPings(path) {
		if (fs.existsSync(path) === false) {
			return [];
		}

		let res = [];
		let data = fs.readFileSync(path).toString().trim().split("\n");

		for (let d of data) {
			if (d.length < 5) {
				continue;
			}

			let parts = d.trim().split(" ");
			res.push({
				name: parts[0].trim(),
				ping: parseInt(parts[1].trim())
			});
		}

		return res;
	}
}
