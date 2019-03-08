const ERC1xxx        = artifacts.require("ERC1xxx");
const ERC734Delegate = artifacts.require("ERC734Delegate");
const GenericTarget  = artifacts.require("GenericTarget");

const { shouldFail } = require('openzeppelin-test-helpers');
const utils          = require('./utils.js');

function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('ERC1xxx', async (accounts) => {

	// assert.isAtLeast(accounts.length, 10, "should have at least 10 accounts");

	var Proxy = null;
	var Ident = null;
	var dest1 = web3.utils.randomHex(20);

	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);
		Target = await GenericTarget.deployed();
	});

	it ("Create proxy", async () => {
		Proxy = await ERC1xxx.new(
			(await ERC734Delegate.deployed()).address,
			utils.prepareData(ERC734Delegate, "initialize", [
				[ web3.utils.keccak256(accounts[0]) ],
				[ "0x0000000000000000000000000000000000000000000000000000000000000003" ],
				1,
				1
			]),
			{ from: accounts[1] }
		);
		Ident = await ERC734Delegate.at(Proxy.address);
	});

	it ("Verify proxy initialization", async () => {
		assert.isTrue (await Ident.keyHasPurpose(web3.utils.keccak256(accounts[0]), "0x0000000000000000000000000000000000000000000000000000000000000001"));
		assert.isTrue (await Ident.keyHasPurpose(web3.utils.keccak256(accounts[0]), "0x0000000000000000000000000000000000000000000000000000000000000002"));
		assert.isFalse(await Ident.keyHasPurpose(web3.utils.keccak256(accounts[0]), "0x0000000000000000000000000000000000000000000000000000000000000004"));
		assert.isFalse(await Ident.keyHasPurpose(web3.utils.keccak256(accounts[1]), "0x0000000000000000000000000000000000000000000000000000000000000001"));
		assert.isFalse(await Ident.keyHasPurpose(web3.utils.keccak256(accounts[1]), "0x0000000000000000000000000000000000000000000000000000000000000002"));
		assert.isFalse(await Ident.keyHasPurpose(web3.utils.keccak256(accounts[1]), "0x0000000000000000000000000000000000000000000000000000000000000004"));
	});

	it("Deposit on proxy", async () => {
		assert.equal(await web3.eth.getBalance(Ident.address), 0);

		txMined = await Ident.send(web3.utils.toWei("1.00", "ether"), { from: accounts[0] });

		assert.equal(await web3.eth.getBalance(Ident.address), web3.utils.toWei("1.00", "ether"));
	});

	it("Execute - Pay with proxy", async () => {
		assert.equal(await web3.eth.getBalance(Ident.address), web3.utils.toWei("1.00", "ether"));
		assert.equal(await web3.eth.getBalance(dest1        ), web3.utils.toWei("0.00", "ether"));

		metatx = await utils.signMetaTX(
			Ident,
			{ type:  0,
				to:    dest1,
				value: web3.utils.toWei("0.50", "ether"),
				data:  [],
				nonce: 1
			},
			accounts[0]
		);

		txMined = await Ident.execute(
			metatx.type,
			metatx.to,
			metatx.value,
			metatx.data,
			metatx.nonce,
			metatx.signature,
			{ from: accounts[0] }
		);

		assert.equal(await web3.eth.getBalance(Ident.address), web3.utils.toWei("0.50", "ether"));
		assert.equal(await web3.eth.getBalance(dest1        ), web3.utils.toWei("0.50", "ether"));
	});

	it("Execute - Call with proxy", async () => {
		randomdata = web3.utils.randomHex(32);

		metatx = await utils.signMetaTX(
			Ident,
			{ type:  0,
				to:    Target.address,
				value: 0,
				data:  utils.prepareData(GenericTarget, "call", [ randomdata ]),
				nonce: 2
			},
			accounts[0]
		);

		txMined = await Ident.execute(
			metatx.type,
			metatx.to,
			metatx.value,
			metatx.data,
			metatx.nonce,
			metatx.signature,
			{ from: accounts[0] }
		);

		assert.equal(await Target.lastSender(), Ident.address);
		assert.equal(await Target.lastData(),   randomdata);
	});

	it("Unauthorized execute", async () => {
		assert.equal(await web3.eth.getBalance(Ident.address), web3.utils.toWei("0.50", "ether"));

		metatx = await utils.signMetaTX(
			Ident,
			{ type:  0,
				to:    Target.address,
				value: 0,
				data:  utils.prepareData(GenericTarget, "call", [ randomdata ]),
				nonce: 3
			},
			accounts[1]
		);

		await shouldFail.reverting(Ident.execute(
			metatx.type,
			metatx.to,
			metatx.value,
			metatx.data,
			metatx.nonce,
			metatx.signature,
			{ from: accounts[0] }
		));

		assert.equal(await web3.eth.getBalance(Ident.address), web3.utils.toWei("0.50", "ether"));
	});

});
