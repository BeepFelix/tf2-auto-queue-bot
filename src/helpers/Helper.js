const request = require("request");
const fs = require("fs");

module.exports = class Helper {
	static GetCurrentVersion(appid) {
		return new Promise((resolve, reject) => {
			request("https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?format=json&appid=" + appid + "&version=0", (err, res, body) => {
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

				if (!json.response || !json.response.success) {
					reject(json);
					return;
				}

				resolve(json.response.required_version);
			});
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

	static async ParseCustomNetworkPings(path) {
		let json = await this.GetNetworkConfig();

		if (fs.existsSync(path) === false) {
			return { system: [], human: [] };
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
				ping: parseInt(parts[1].trim()),
				ping_status: parseInt(parts[2].trim())
			});
		}

		return { system: res, human: res.map(m => (typeof json.pops[m.name] === "undefined" ? m.name : json.pops[m.name].desc) + ": " + m.ping) };
	}

	static parseObject(tf2User, type, buffer) {
		if (type === 2004) {
			try {
				let dec = tf2User.Protos.tf2.CSOTFGameServerLobby.decode(buffer);
				return { type: type, decoded: dec };
			} catch(e) {};
		}

		if (type === 2008) {
			try {
				let dec = tf2User.Protos.tf2.CTFLobbyInviteProto.decode(buffer);
				return { type: type, decoded: dec };
			} catch(e) {};
		}

		if (type === 2003) {
			try {
				let dec = tf2User.Protos.tf2.CSOTFParty.decode(buffer);
				return { type: type, decoded: dec };
			} catch(e) {};
		}

		if (type === 2007) {
			try {
				let dec = tf2User.Protos.tf2.CSOTFRatingData.decode(buffer);
				return { type: type, decoded: dec };
			} catch(e) {};
		}

		return { type: type, decoded: undefined };
	}

	static LauncherWithDebugMode() {
		// Doesnt detect if a debugger is attached after launch but I do not need that for Visual Studio Code
		const argv = process.execArgv.join();
		return argv.includes("inspect-brk") || argv.includes("debug");
	}
}
