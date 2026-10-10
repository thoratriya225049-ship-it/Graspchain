// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AssessmentRegistry
/// @notice Public registry of Graspchain assessment commitments. Stores only hashes and the
///         score; never names, codes or answers. Anyone can call `verify` without trusting
///         Graspchain's server (PRD §9.4.3).
contract AssessmentRegistry is Ownable {
    struct Record {
        bytes32 recordHash;
        bytes32 studentRef;
        uint16  scoreX10;      // 10..100 (74 = 7.4)
        uint32  rubricVersion;
        uint64  timestamp;
    }

    mapping(bytes32 => Record) public records;      // assessmentId => Record
    mapping(bytes32 => uint64) public batchRoots;   // merkleRoot => timestamp (F17)

    event AssessmentRecorded(bytes32 indexed id, bytes32 indexed studentRef, bytes32 recordHash, uint16 scoreX10);
    event AssessmentSuperseded(bytes32 indexed oldId, bytes32 indexed newId);
    event BatchAnchored(bytes32 indexed root, uint32 count);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function record(bytes32 id, bytes32 recordHash, bytes32 studentRef, uint16 scoreX10, uint32 rubricVersion)
        public onlyOwner
    {
        require(records[id].timestamp == 0, "exists");
        require(scoreX10 >= 10 && scoreX10 <= 100, "score");
        records[id] = Record(recordHash, studentRef, scoreX10, rubricVersion, uint64(block.timestamp));
        emit AssessmentRecorded(id, studentRef, recordHash, scoreX10);
    }

    function supersede(bytes32 oldId, bytes32 newId, bytes32 recordHash, bytes32 studentRef, uint16 scoreX10, uint32 rubricVersion)
        external onlyOwner
    {
        require(records[oldId].timestamp != 0, "missing");
        require(records[oldId].studentRef == studentRef, "student");
        record(newId, recordHash, studentRef, scoreX10, rubricVersion);
        emit AssessmentSuperseded(oldId, newId);
    }

    function anchorBatch(bytes32 root, uint32 count) external onlyOwner {
        require(batchRoots[root] == 0, "exists");
        batchRoots[root] = uint64(block.timestamp);
        emit BatchAnchored(root, count);
    }

    function verify(bytes32 id, bytes32 recordHash) external view returns (bool) {
        return records[id].timestamp != 0 && records[id].recordHash == recordHash;
    }
}
