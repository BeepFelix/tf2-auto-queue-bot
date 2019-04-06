// Configuration
const config = require("../config.json");

// Modules
const SteamUser = require("steam-user");
const GameCoordinator = require("./helpers/GameCoordinator.js");
const Helper = require("./helpers/Helper.js");
const dataParser = require("./helpers/dataParser.js");

// Instances
const steamUser = new SteamUser();
const tf2User = new GameCoordinator(steamUser);
let curVersion = 0;
let prePartyID = "0";
let inMatch = false;

// Log into Steam
steamUser.logOn({
	accountName: config.accountName,
	password: config.password
});

steamUser.on("error", (err) => {
	console.log("Unexpected error occured. Please try again.");
	if (typeof process.send === "function") {
		process.send("Unexpected error occured. Please try again.");
	}

	console.error(err);
});
steamUser.on("loggedOn", async () => {
	console.log("Successfully logged into Steam as " + steamUser.steamID.getSteamID64());
	if (typeof process.send === "function") {
		process.send("Successfully logged into Steam as " + steamUser.steamID.getSteamID64());
	}

	curVersion = await Helper.GetCurrentVersion(440);

	steamUser.setPersona(SteamUser.EPersonaState.Online);

	let success = await new Promise((resolve, reject) => {
		// Check license for TF2
		if (steamUser.licenses !== null) {
			let filter = steamUser.licenses.filter(l => [ 330198, 197845, 518, 519, 938, 7907 ].includes(l.package_id));
			if (filter.length <= 0) {
				// Request TF2 license
				steamUser.requestFreeLicense(440, (err, grantedPackages, grantedAppIDs) => {
					if (err) {
						reject(err);
						return;
					}

					resolve(true);
				});
			}
		}

		// Request TF2 license
		steamUser.requestFreeLicense(440, (err, grantedPackages, grantedAppIDs) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(true);
		});
	}).catch((err) => {
		console.error(err);
	});

	if (success !== true) {
		console.log("Failed to request TF2 license from Steam. Logging off...");
		if (typeof process.send === "function") {
			process.send("Failed to request TF2 license from Steam. Logging off...");
		}

		steamUser.logOff();
		return;
	}

	steamUser.gamesPlayed([ 440 ]);
});

steamUser.on("appLaunched", async (appid) => {
	let hello = await tf2User.start();
	console.log("Welcomed GameCoordinator on version " + hello.version + " with country code " + hello.txn_country_code);
	if (typeof process.send === "function") {
		process.send("Welcomed GameCoordinator on version " + hello.version + " with country code " + hello.txn_country_code);
	}

	await tf2User.sendMessage(
		440,
		tf2User.Protos.tf2.ETFGCMsg.k_EMsgGC_TFClientInit,
		{},
		tf2User.Protos.tf2.CMsgTFClientInit,
		{
			client_version: curVersion,
			language: 0
		},
		undefined,
		undefined,
		30000
	);

	await tf2User.sendMessage(
		440,
		tf2User.Protos.tf2.ESOMsg.k_ESOMsg_CacheSubscriptionRefresh,
		{},
		tf2User.Protos.tf2.CMsgSOCacheSubscriptionRefresh,
		{
			owner: steamUser.steamID.toString()
		},
		undefined,
		undefined,
		30000
	);

	console.log("Sending Datacenter ping updates...");
	if (typeof process.send === "function") {
		process.send("Sending Datacenter ping updates...");
	}

	let pings = await Helper.ParseCustomNetworkPings(process.argv[2]);
	await tf2User.sendMessage(
		440,
		tf2User.Protos.tf2.ETFGCMsg.k_EMsgGCDataCenterPing_Update,
		{},
		tf2User.Protos.tf2.CMsgGCDataCenterPing_Update,
		{
			pingdata: pings.system
		},
		undefined,
		undefined,
		30000
	);

	console.log(pings.human.length <= 0 ? "Failed to parse datacenter pings" : pings.human.join("\n"));

	await new Promise(p => setTimeout(p, 3000));
	console.log("Starting queue with party " + prePartyID);
	if (typeof process.send === "function") {
		process.send("Starting queue with party " + prePartyID);
	}

	// Start queue
	await tf2User.sendMessage(
		440,
		tf2User.Protos.tf2.ETFGCMsg.k_EMsgGCParty_QueueForMatch,
		{},
		tf2User.Protos.tf2.CMsgPartyQueueForMatch,
		{
			party_id: prePartyID === "0" ? null : prePartyID,
            final_options: {
                overwrite_existing: true,
                group_criteria: {
                    custom_ping_tolerance: 350,
                    casual_criteria: {
                        selected_maps_bits: [
                            4294967294,
                            4026531839,
                            31457280,
                            2016
                        ]
                    }
                },
                player_uistate: {
                    menu_step: 1,
                    match_group: 7
                }
            },
            match_group: 7
        },
		undefined,
		undefined,
		30000
	);
});

steamUser.on("disconnected", async (eresult, msg) => {
	if (eresult === 3) {
		console.log("Successfully logged off and disconnected from Steam");
		if (typeof process.send === "function") {
			process.send("Successfully logged off and disconnected from Steam");
		}

		if (Helper.LauncherWithDebugMode() === true) {
			setInterval(() => {}, 1000000);
			return;
		}

		await new Promise(r => setTimeout(r, 2000));
		process.exit(0);

		return;
	}

	console.log("Unexpectedly disconnected from Steam with result: " + eresult);
	if (typeof process.send === "function") {
		process.send("Unexpectedly disconnected from Steam with result: " + eresult);
	}
});

tf2User.on("message", async (msgType, payload) => {
	if ([ 4004, 2501, 6525, 6518, 1049 ].includes(msgType) === true) {
		return;
	}

	if (msgType === tf2User.Protos.tf2.ESOMsg.k_ESOMsg_CacheSubscriptionCheck) {
		let result = tf2User.Protos.tf2.CMsgSOCacheSubscriptionCheck.decode(payload);
		return;
	}

	if (msgType === tf2User.Protos.tf2.ESOMsg.k_ESOMsg_Destroy) {
		let result = tf2User.Protos.tf2.CTFLobbyInviteProto.decode(payload);
		processBlob(result, "destroy");
		return;
	}

	if (msgType === tf2User.Protos.tf2.ESOMsg.k_ESOMsg_CacheSubscribed) {
		let result = tf2User.Protos.tf2.CMsgSOCacheSubscribed.decode(payload);

		for (let obj of result.objects) {
			if (Array.isArray(obj.object_data) === true) {
				for (let o of obj.object_data) {
					processBlob({ type_id: obj.type_id, object_data: o });
				}
			} else {
				processBlob(obj);
			}
		}
		return;
	}

	if (msgType === tf2User.Protos.tf2.ESOMsg.k_ESOMsg_Create) {
		let result = tf2User.Protos.tf2.CMsgSOSingleObject.decode(payload);
		processBlob(result);
		return;
	}

	if (msgType === tf2User.Protos.tf2.ESOMsg.k_ESOMsg_UpdateMultiple) {
		let result = tf2User.Protos.tf2.CMsgSOMultipleObjects.decode(payload);

		for (let obj of result.objects) {
			if (Array.isArray(obj.object_data) === true) {
				for (let o of obj.object_data) {
					processBlob({ type_id: obj.type_id, object_data: o });
				}
			} else {
				processBlob(obj);
			}
		}
		return;
	}

	if (Helper.LauncherWithDebugMode() === true) {
		console.log(msgType);
	}
});

async function processBlob(obj, type = "created") {
	let o = Helper.parseObject(tf2User, obj.type_id, obj.object_data);

	if (o.type === 2003 && typeof o.decoded !== "undefined") {
		if (typeof o.decoded.matchmaking_queues !== "undefined" && o.decoded.matchmaking_queues.length > 0) {
			console.log("Started queue for match group " + o.decoded.matchmaking_queues[0].match_group + " at " + new Date(o.decoded.matchmaking_queues[0].queued_time * 1000).toLocaleString());
			if (typeof process.send === "function") {
				process.send("Started queue for match group " + o.decoded.matchmaking_queues[0].match_group + " at " + new Date(o.decoded.matchmaking_queues[0].queued_time * 1000).toLocaleString());
			}
		}

		if (typeof o.decoded.associated_lobby_id !== "undefined" && o.decoded.associated_lobby_id !== null && o.decoded.associated_lobby_id.toString() !== "0" && type === "destroyed") {
			console.log("ERROR: Account still associated with match lobby: " + o.decoded.associated_lobby_id.toString());
			if (typeof process.send === "function") {
				process.send("ERROR: Account still associated with match lobby: " + o.decoded.associated_lobby_id.toString());
			}

			await tf2User.sendMessage(
				440,
				tf2User.Protos.tf2.ETFGCMsg.k_EMsgGCExitMatchmaking,
				{},
				tf2User.Protos.tf2.CMsgExitMatchmaking,
				{
					explicit_abandon: true,
					lobby_id: o.decoded.associated_lobby_id.toString()
				},
				undefined,
				undefined,
				30000
			);
			return;
		}

		prePartyID = o.decoded.party_id.toString();
		return;
	}

	if (o.type === 2004 && typeof o.decoded !== "undefined") {
		let parsed = undefined;
		try {
			parsed = dataParser(steamUser.steamID.toString(), o.decoded);
		} catch(e) {};

		if (parsed !== undefined && typeof parsed.connect !== "undefined") {
			if (inMatch === true) {
				return;
			}
			inMatch = true;

			if (Helper.LauncherWithDebugMode() === true) {
				console.log(parsed);
			}

			const output = [];
			output.push("IP: " + parsed.connect);
			output.push("Map: " + parsed.map_name);
			output.push("Match started: " + new Date(parsed.formed_time * 1000).toLocaleString());
			output.push("Lobby ID: " + parsed.lobby_id.toString());
			output.push("Match ID: " + parsed.match_id.toString());
			output.push("Server ID: " + parsed.server_id.toString());
			output.push("Member: " + parsed.members.length);
			output.push("Currently joining: " + parsed.pending_members.length);
			output.push("Total members: " + parsed.allMembers.length);
			output.push("Max members: " + parsed.fixed_match_size);
			output.push("Unique parties: " + parsed.parties.length);
			output.push("Match State: " + parsed.state);
			output.push("Next maps for vote: " + parsed.next_maps_for_vote.join(" & "));
			output.push("Lobby matchmaking version: " + parsed.lobby_mm_version);
			output.push("War Match: " + (parsed.is_war_match ? "True" : "False"));
			console.log(output.join("\n"));
			if (typeof process.send === "function") {
				process.send(output.join("<br>"));
			}

			console.log("Exiting matchmaking in 2 seconds...");
			if (typeof process.send === "function") {
				process.send("Exiting matchmaking in 2 seconds...");
			}

			await new Promise(r => setTimeout(r, 2000));

			await tf2User.sendMessage(
				440,
				tf2User.Protos.tf2.ETFGCMsg.k_EMsgGCExitMatchmaking,
				{},
				tf2User.Protos.tf2.CMsgExitMatchmaking,
				{
					explicit_abandon: true,
					lobby_id: o.decoded.lobby_id.toString()
				},
				undefined,
				undefined,
				30000
			);

			console.log("Logging off in 2 seconds...");
			if (typeof process.send === "function") {
				process.send("Logging off in 2 seconds...");
			}

			await new Promise(r => setTimeout(r, 2000));

			steamUser.logOff();
			return;
		} else {
			console.log("Left matchmaking for lobby ID: " + o.decoded.lobby_id.toString());
			if (typeof process.send === "function") {
				process.send("Left matchmaking for lobby ID: " + o.decoded.lobby_id.toString());
			}

			console.log("Logging off in 5 seconds...");
			if (typeof process.send === "function") {
				process.send("Logging off in 5 seconds...");
			}

			await new Promise(r => setTimeout(r, 5000));

			steamUser.logOff();
			return;
		}
	}

	if (o.type === 2008 && typeof o.decoded !== "undefined") {
		await tf2User.sendMessage(
			440,
			tf2User.Protos.tf2.ETFGCMsg.k_EMsgGC_AcceptLobbyInvite,
			{},
			tf2User.Protos.tf2.CMsgAcceptLobbyInvite,
			{
				invited_lobby_id: o.decoded.lobby_id.toString()
			},
			undefined,
			undefined,
			30000
		);
		return;
	}

	if (Helper.LauncherWithDebugMode() === false) {
		return;
	}

	if (typeof o.decoded !== "undefined") {
		console.log(o);
		return;
	}
}
