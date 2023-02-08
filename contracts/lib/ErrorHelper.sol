// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../lib/NFTHelper.sol";
import "../interfaces/IAdmin.sol";
import "../interfaces/ITokenMintERC721.sol";
import "../interfaces/ITokenMintERC1155.sol";
import "../interfaces/ITreasury.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/Collection/ICollectionFactory.sol";
import "../interfaces/IStakingPool.sol";
import "../interfaces/IOrder.sol";
import "../interfaces/IMetaCitizen.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/Collection/ITokenERC721.sol";
import "../interfaces/Collection/ITokenERC1155.sol";

library ErrorHelper {
    // Validatable
    error InsufficientBalance(uint256 _available, uint256 _required);
    error InValidOrderContract(address _contract);
    error InValidMarketplaceManagerContract(address _contract);
    error InValidTokenCollectionERC721Contract(address _contract);
    error InValidTokenCollectionERC1155Contract(address _contract);
    error InValidAdminContract(address _contract);
    error InValidTokenMintERC721Contract(address _contract);
    error InValidTokenMintERC1155Contract(address _contract);
    error InValidTreasuryContract(address _contract);
    error InValidMarketplaceManagerContract(address _contract);
    error InValidCollectionFactoryContract(address _contract);
    error InValidStakingPoolContract(address _contract);
    error InValidMetaCitizenContract(address _contract);
    //
    error InvalidAddress();
    error InvalidAmount();
    error PaymentTokenIsNotSupported();
    error InvalidWallet(address _contract);
    error CallerIsNotOwnerOrAdmin();
    error CallerIsNotOwner();
    // Order Manage Error
    error InvalidMarketItemId();
    error InvalidNftAddress(address _invalid);
    error InvalidOrderTime();
    error InvalidOwner(address _invalidOwner);
    error UserCanNotOffer();
    error InvalidTokenId(uint256 _invalidId);
    error CanNotUpdatePaymentToken();
    error MarketItemIsNotAvailable();
    error NotInTheOrderTime();
    error RequireOwneMetaCitizenNFT();
    error InvalidOrderId();
    error NotTheSeller(address _available, address _expected);
    error NotTheOwnerOfOrder(address _available, address _expected);
    error OrderIsNotAvailable();
    error OrderIsExpired();
    error NotExpiredYet();
    error InvalidEndTime();
    error TokenIsNotExisted(address _contract, uint256 tokenId);
    error CanNotBuyYourNFT();
    error NotEqualPrice();
    error MarketItemIsNotSelling();
    error EitherNotInWhitelistOrNotOwnMetaCitizenNFT();
    // Marketplace manager Error
    error UserDidNotCreateCollection();
    error InvalidNFTAddress(address _invalidAddress);
    // MarketPlace manager Error
    error InvalidTimeForCreate();
    error CallerIsNotOrderManager();
    error CallerIsNotOrderManagerOrMTVSManager();
    // MetaDrop Error
    error InvalidDropId();
    error ServiceFeeExceedMintFee();
    error InvalidRoot();
    error InvalidMintingSupply();
    error InvalidFundingReceiver();
    error InvalidOwnerForUpdate();
    error DropIsCanceled();
    error NotPermitToMintNow();
    error CanNotMintAnyMore();
    error NotEnoughFee();
    error NotPayBothToken();
    // Collection Error
    error ExceedMaxCollection();
    error CloneCollectionFailed();
    error InvalidMaxCollection();
    error InvalidMaxTotalSupply();
    error InvalidMaxCollectionOfUser();
    // Token721 Error
    error CallerIsNotFactory();
    error ExceedTotalSupply();
    error ExceedMaxMintBatch();
    error InvalidMaxBatch();
    error URIQueryNonExistToken();
    // Token1155 Error
    error InvalidArrayInput();
    // Pool Factory Error
    error ClonePoolFailed();
    // Staking Error
    error NotAllowToClaim();
    error NotTimeForStake();
    error AlreadyRequested();
    error OverLimit();
    error NotAllowToUnstake();
    error MustRequestFirst();
    error ExceedAmount();
    error MustStakeMoreThan500Dollar();
    error MustBuyNFTInMarketplaceFirst();
    // NFT
    error InvalidPaymentToken();
    error AlreadyHaveOne();
    error CanNotBeTransfered();
    error InvalidLength();
    error AlreadyRegister();
    error FailToSendIntoContract();
    error TransferNativeFail();
    error NotTheOwnerOfOffer();

    // Order manager Function
    function _checkValidOrderTime(uint256 _time) internal view {
        if (_time < block.timestamp) {
            revert ErrorHelper.InvalidOrderTime();
        }
    }

    function _checkUserCanOffer(address _to) internal view {
        if (_to == msg.sender) {
            revert ErrorHelper.UserCanNotOffer();
        }
    }

    function _checkValidNFTAddress(address _nftAddress) internal {
        if (_nftAddress == address(0)) {
            revert ErrorHelper.InvalidNftAddress(_nftAddress);
        }
        if (!NFTHelper.isERC721(_nftAddress) && !NFTHelper.isERC1155(_nftAddress)) {
            revert ErrorHelper.InvalidNftAddress(_nftAddress);
        }
    }

    function _checkValidOwnerOf721(address _nftAddress, uint256 _tokenId, address _to) internal view {
        if (IERC721Upgradeable(_nftAddress).ownerOf(_tokenId) != _to) {
            revert ErrorHelper.InvalidOwner(_to);
        }
    }

    function _checkValidOwnerOf1155(address _nftAddress, uint256 _tokenId, address _to, uint256 _amount) internal view {
        if (IERC1155Upgradeable(_nftAddress).balanceOf(_to, _tokenId) < _amount) {
            revert ErrorHelper.InvalidAmount();
        }
    }

    function _checkValidAmountOf721(uint256 _amount) internal pure {
        if (_amount != 1) {
            revert ErrorHelper.InvalidAmount();
        }
    }

    function _checkCanUpdatePaymentToken(address _paymentToken, address _expected) internal pure {
        if (_paymentToken != _expected) {
            revert ErrorHelper.CanNotUpdatePaymentToken();
        }
    }

    function _checkValidMarketItem(uint256 _status, uint256 _expected) internal pure {
        if (_status != _expected) {
            revert ErrorHelper.MarketItemIsNotAvailable();
        }
    }

    function _checkInOrderTime(uint256 _start, uint256 _end) internal view {
        if (!(_start <= block.timestamp && block.timestamp <= _end)) {
            revert ErrorHelper.NotInTheOrderTime();
        }
    }

    function _checkInWhiteListAndOwnNFT(
        address _admin,
        address _marketplace,
        uint256 _marketItemId,
        bytes32[] memory _proof
    ) internal view {
        if (
            !(IAdmin(_admin).isOwnedMetaCitizen(msg.sender) &&
                IMarketplaceManager(_marketplace).verify(_marketItemId, _proof, msg.sender))
        ) {
            revert ErrorHelper.EitherNotInWhitelistOrNotOwnMetaCitizenNFT();
        }
    }

    function _checkIsSeller(address _expected) internal view {
        if (_expected != msg.sender) {
            revert ErrorHelper.NotTheSeller(msg.sender, _expected);
        }
    }

    function _checkAvailableOrder(uint256 _status, uint256 _expected) internal pure {
        if (_status != _expected) {
            revert ErrorHelper.OrderIsNotAvailable();
        }
    }

    function _checkInOrderTime(uint256 _time) internal view {
        if (_time < block.timestamp) {
            revert ErrorHelper.OrderIsExpired();
        }
    }

    function _checkExpired(uint256 _time) internal view {
        if (_time >= block.timestamp) {
            revert ErrorHelper.OrderIsExpired();
        }
    }

    function _checkOwnerOfOrder(address _owner) internal view {
        if (_owner != msg.sender) {
            revert ErrorHelper.NotTheOwnerOfOrder(msg.sender, _owner);
        }
    }

    function _checkValidEndTime(uint256 _time) internal view {
        if (_time <= block.timestamp) {
            revert ErrorHelper.InvalidEndTime();
        }
    }

    function _checkExistToken(address _token, uint256 _tokenId) internal {
        if (!NFTHelper.isTokenExist(_token, _tokenId)) {
            revert ErrorHelper.TokenIsNotExisted(_token, _tokenId);
        }
    }

    function _checkMarketItemInSelling(uint256 _start, uint256 _end) internal view {
        if (!(_start <= block.timestamp && block.timestamp <= _end)) {
            revert ErrorHelper.MarketItemIsNotSelling();
        }
    }

    function _checkOwnerOfMarketItem(address _seller) internal view {
        if (_seller == msg.sender) {
            revert ErrorHelper.CanNotBuyYourNFT();
        }
    }

    function _checkEqualPrice(uint256 _price, uint256 _expectedPrice) internal pure {
        if (_price != _expectedPrice) {
            revert ErrorHelper.NotEqualPrice();
        }
    }

    // Marketpalce Manager Function
    function _checkPermittedPaymentToken(address admin, IERC20Upgradeable _paymentToken) internal view {
        if (!IAdmin(admin).isPermittedPaymentToken(_paymentToken)) {
            revert ErrorHelper.PaymentTokenIsNotSupported();
        }
    }

    function _checkValidTimeForCreate(uint256 _startTime, uint256 _endTime) internal view {
        if (!(block.timestamp <= _startTime && _startTime < _endTime)) {
            revert ErrorHelper.InvalidTimeForCreate();
        }
    }

    // Marketplace Manager Function
    function _checkUserCreateCollection(ICollectionFactory _collectionFactory, address _nftAddress) internal view {
        if (!(_collectionFactory.checkCollectionOfUser(msg.sender, _nftAddress))) {
            revert ErrorHelper.UserDidNotCreateCollection();
        }
    }

    // Drop
    function _checkValidFee(uint256 _numerator, uint256 _denominator) internal pure {
        if (_numerator > _denominator) {
            revert ErrorHelper.ServiceFeeExceedMintFee();
        }
    }

    function _checkValidRoot(bytes32 _root) internal pure {
        if (_root == 0) {
            revert ErrorHelper.InvalidRoot();
        }
    }

    function _checkValidReceiver(address _receiver) internal pure {
        if (_receiver == address(0)) {
            revert ErrorHelper.InvalidFundingReceiver();
        }
    }

    function _checkValidSupply(uint256 _supply) internal pure {
        if (_supply == 0) {
            revert ErrorHelper.InvalidMintingSupply();
        }
    }

    function _checkDropReceiver(address _expected) internal view {
        if (msg.sender != _expected) {
            revert ErrorHelper.InvalidOwnerForUpdate();
        }
    }

    function _checkDropCancel(bool _isCancel) internal pure {
        if (_isCancel) {
            revert ErrorHelper.DropIsCanceled();
        }
    }

    function _checkDropPermitMint(bool _canBuy) internal pure {
        if (!_canBuy) {
            revert ErrorHelper.NotPermitToMintNow();
        }
    }

    function _checkDropMintable(uint256 _amount, uint256 _limit) internal pure {
        if (_amount > _limit) {
            revert ErrorHelper.CanNotMintAnyMore();
        }
    }

    function _checkEnoughFee(uint256 _amount) internal view {
        if (msg.value > _amount) {
            revert ErrorHelper.NotEnoughFee();
        }
    }

    function _checkMaxCollectionOfUser(uint256 _amount) internal pure {
        if (_amount == 0) {
            revert ErrorHelper.InvalidMaxCollectionOfUser();
        }
    }

    function _checkMaxTotalSupply(uint256 _amount) internal pure {
        if (_amount == 0) {
            revert ErrorHelper.InvalidMaxTotalSupply();
        }
    }

    function _checkMaxCollection(uint256 _amount) internal pure {
        if (_amount == 0) {
            revert ErrorHelper.InvalidMaxCollection();
        }
    }

    function _checkCloneCollection(address _clone) internal pure {
        if (_clone == address(0)) {
            revert ErrorHelper.CloneCollectionFailed();
        }
    }

    function _checkExceedMaxCollection(uint256 _maxOwner, uint256 _maxOfUser) internal pure {
        if (_maxOwner >= _maxOfUser) {
            revert ErrorHelper.ExceedMaxCollection();
        }
    }

    // Token721 Function
    function _checkMaxBatch(uint256 _max) internal pure {
        if (_max == 0) {
            revert ErrorHelper.InvalidMaxBatch();
        }
    }

    function _checkExceedTotalSupply(uint256 _total, uint256 _supply) internal pure {
        if (_total > _supply) {
            revert ErrorHelper.ExceedTotalSupply();
        }
    }

    function _checkExceedMintTotalSupply(uint256 _total, uint256 _supply) internal pure {
        if (_total >= _supply) {
            revert ErrorHelper.ExceedTotalSupply();
        }
    }

    function _checkEachBatch(uint256 _times, uint256 _supply) internal pure {
        if (!(_times > 0 && _times <= _supply)) {
            revert ErrorHelper.ExceedMaxMintBatch();
        }
    }

    //Token1155 Function
    function _checkValidAmount(uint256 _amount) internal pure {
        if (_amount == 0) {
            revert ErrorHelper.InvalidAmount();
        }
    }

    // Pool Factory Function
    function _checkValidClone(address _clone) internal pure {
        if (_clone == address(0)) {
            revert ErrorHelper.ClonePoolFailed();
        }
    }

    // Staking Pool Function
    function _checkClaimTime(uint256 _start, uint256 duration) internal view {
        if (!(_start + duration > block.timestamp)) {
            revert ErrorHelper.NotAllowToClaim();
        }
    }

    function _checkIsRequested(bool _isRequested) internal pure {
        if (_isRequested) {
            revert ErrorHelper.AlreadyRequested();
        }
    }

    function _checkTimeForStake(uint256 _start, uint256 _duration) internal view {
        if (!(block.timestamp > _start && _start + _duration > block.timestamp)) {
            revert ErrorHelper.NotTimeForStake();
        }
    }

    function _checkUnstakeTime(uint256 _start, uint256 duration) internal view {
        if (!(_start + duration <= block.timestamp && _start != 0)) {
            revert ErrorHelper.NotAllowToUnstake();
        }
    }

    function _checkMustRequested(bool _isRequest, uint256 _unlockedTime) internal view {
        if (!(_isRequest && _unlockedTime <= block.timestamp)) {
            revert ErrorHelper.MustRequestFirst();
        }
    }

    function _checkAcceptRequested(bool _isRequest) internal pure {
        if (!_isRequest) {
            revert ErrorHelper.MustRequestFirst();
        }
    }

    function _checkExceed(uint256 _amount0, uint256 _amount1) internal pure {
        if (_amount0 < _amount1) {
            revert ErrorHelper.ExceedAmount();
        }
    }

    function _checkEqualLength(uint256 _amount0, uint256 _amount1) internal pure {
        if (_amount0 != _amount1) {
            revert ErrorHelper.InvalidLength();
        }
    }

    function _checkAmountOfStake(uint256 _amount) internal pure {
        if (_amount < 5e20) {
            revert ErrorHelper.MustStakeMoreThan500Dollar();
        }
    }

    function _checkAmountOfStake(IAdmin admin, IERC20Upgradeable _paymentToken) internal view {
        if (!(address(_paymentToken) != address(0) && admin.isPermittedPaymentToken(_paymentToken))) {
            revert ErrorHelper.InvalidPaymentToken();
        }
    }

    function _checkAlreadyOwn(uint256 _amount) internal pure {
        if (_amount != 0) {
            revert ErrorHelper.AlreadyHaveOne();
        }
    }

    function _checkValidAddress(address _addr) internal pure {
        if (_addr == address(0)) {
            revert ErrorHelper.InvalidAddress();
        }
    }

    function _checkRegister(address _addr) internal pure {
        if (_addr != address(0)) {
            revert ErrorHelper.AlreadyRegister();
        }
    }

    function _checkOwner(address _addr0, address _addr1) internal pure {
        if (_addr0 != _addr1) {
            revert ErrorHelper.NotTheOwnerOfOffer();
        }
    }
}
