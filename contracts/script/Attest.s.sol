// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../PGPRegistry.sol";

contract Attest is Script {
    function run() external {
        string memory fingerprint = "6E0053911942A889426C1866E34D9266098F7FE7";
        string memory pgpSignature = vm.readFile("script/pgp-sig.txt");
        string memory pgpPublicKey = vm.readFile("script/pgp-key.txt");

        vm.startBroadcast();
        PGPRegistry registry = PGPRegistry(0x6Ccb62769675B1f19375E5f4C6E8Fc418e50BFD0);
        registry.attest(fingerprint, pgpSignature, pgpPublicKey);
        vm.stopBroadcast();

        console.log("Attested fingerprint:", fingerprint);
    }
}
