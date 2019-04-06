module.exports = (ourSteamID, server) => {
	let parties = [ server.members, server.pending_members ].flat().reduce((result, member) => {
		const a = result.find((mem) => mem.original_party_id ? mem.original_party_id.toString() : "0" === member.original_party_id.toString());
		a ? a.members.push(member) : result.push({ party: member.original_party_id.toString(), members: [ member ]});
		return result;
	}, []);
	let us = [ server.members, server.pending_members ].flat().filter(m => m.id.toString() === ourSteamID.toString())[0];

	const output = server;
	output.us = us;
	output.allMembers = [ server.members, server.pending_members ].flat();
	output.parties = parties;

	return output;
}
