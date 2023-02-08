// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/**
 *  @notice This struct defining data of each drop.
 *
 *  @param root                     This data contain merkle root that use for verifying whitelist member.
 *  @param owner                    Address of Drop owner.
 *  @param fundingReceiver          Address of receving minting fee.
 *  @param nft                      NFT address that be used for minting.
 *  @param paymentToken             Address of mintting payment token.
 *  @param serviceFeeNumerator      A numberator of service fee, should not exceed 100%.
 *  @param mintedTotal              Total token that minted.
 *  @param mintFee                  A consistent fee of minting token.
 *  @param mintableLimit            Max amount of token each user can mint.
 *  @param maxSupply                Max total tokens that user can mint in this drop event.
 *  @param startTime                Start time of a Drop round
 *  @param endTime                  End time of a Drop round
 *  @param isCanceled               Indicating if the DropRecord is cancelled
 */
struct DropRecord {
    bytes32 root;
    address owner;
    address fundingReceiver;
    address nft;
    address paymentToken;
    uint256 serviceFeeNumerator;
    uint256 mintedTotal;
    uint256 mintFee;
    uint256 mintableLimit;
    uint256 maxSupply;
    uint256 startTime;
    uint256 endTime;
    bool isCanceled;
}

/**
 *  @notice This struct defining param data for creating/updating a drop
 *
 *  @param root                     This data contain merkle root that use for verifying whitelist member.
 *  @param fundingReceiver          Address of receving minting fee.
 *  @param nft                      NFT address that be used for minting.
 *  @param paymentToken             Address of mintting payment token.
 *  @param maxSupply                Max total tokens that user can mint in this drop event.
 *  @param mintFee                  Fee of each mint transaction.
 *  @param mintableLimit            Max amount of token each user can mint.
 *  @param startTime                Start time of a Drop round
 *  @param endTime                  End time of a Drop round
 */
struct DropParams {
    bytes32 root;
    address fundingReceiver;
    address nft;
    address paymentToken;
    uint256 maxSupply;
    uint256 mintFee;
    uint256 mintableLimit;
    uint256 startTime;
    uint256 endTime;
}
