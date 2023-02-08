// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../lib/NFTHelper.sol";
import "../Validatable.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../lib/ErrorHelper.sol";

/**
 *  @title  Dev Marketplace Contract
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the token Marketplace manager for Operation. These contract using to control
 *          all action which user call and interact for purchasing in marketplace operation.
 */
contract MarketplaceManager is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, IMarketplaceManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice tokenMintERC721 is interface of tokenMint ERC721
     */
    ITokenMintERC721 public tokenMintERC721;

    /**
     *  @notice tokenMintERC1155 is interface of tokenMint ERC1155
     */
    ITokenMintERC1155 public tokenMintERC1155;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    /**
     *  @notice collectionFactory is interface of collection Factory
     */
    ICollectionFactory public collectionFactory;

    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, string indexed eventid);
    event SetMarketplace(IMarketplaceManager indexed oldMarketplace, IMarketplaceManager indexed newMarketplace);
    event SetCollectionFactory(ICollectionFactory indexed oldValue, ICollectionFactory indexed newValue);
    event Created(
        NFTHelper.Type indexed typeMint,
        address indexed nftAddress,
        uint256 tokenId,
        address from,
        address indexed to,
        uint256 amount
    );

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        ITokenMintERC721 nft721Addr,
        ITokenMintERC1155 nft1155Addr,
        IERC20Upgradeable _paymentToken,
        IMarketplaceManager _marketplaceAddr,
        ICollectionFactory _collectionFactoryAddr,
        IAdmin _admin
    )
        public
        initializer
        validTokenMintERC721(nft721Addr)
        validTokenMintERC1155(nft1155Addr)
        notZeroAddress(address(_paymentToken))
        validMarketplaceManager(_marketplaceAddr)
        validCollectionFactory(_collectionFactoryAddr)
    {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        marketplace = _marketplaceAddr;
        paymentToken = _paymentToken;
        tokenMintERC721 = nft721Addr;
        tokenMintERC1155 = nft1155Addr;
        collectionFactory = _collectionFactoryAddr;
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setMarketplace(
        IMarketplaceManager _newMarketplace
    ) external onlyAdmin validMarketplaceManager(_newMarketplace) {
        IMarketplaceManager oldMarketplace = marketplace;
        marketplace = _newMarketplace;
        emit SetMarketplace(oldMarketplace, marketplace);
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setCollectionFactory(
        ICollectionFactory _newCollectionFactory
    ) external onlyAdmin validCollectionFactory(_newCollectionFactory) {
        ICollectionFactory oldCollectionFactory = collectionFactory;
        collectionFactory = _newCollectionFactory;
        emit SetCollectionFactory(oldCollectionFactory, collectionFactory);
    }

    /**
     *  @notice Create NFT
     *
     *  @dev    All caller can call this function.
     */
    function createNFT(
        bool isSellOnMarket,
        NFTHelper.Type typeNft,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment
    ) external whenNotPaused nonReentrant notZero(amount) notZero(price) {
        if (typeNft == NFTHelper.Type.ERC721) {
            _create721(
                isSellOnMarket,
                typeNft,
                address(tokenMintERC721),
                amount,
                uri,
                price,
                startTime,
                endTime,
                payment
            );
        } else if (typeNft == NFTHelper.Type.ERC1155) {
            _create1155(
                isSellOnMarket,
                typeNft,
                address(tokenMintERC1155),
                amount,
                uri,
                price,
                startTime,
                endTime,
                payment
            );
        }
    }

    /**
     *  @notice Buy NFT Ticket for join events
     *
     *  @dev    All caller can call this function.
     */
    function buyTicketEvent(string memory eventId, uint256 amount) external nonReentrant notZero(amount) whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), address(admin.treasury()), amount);

        emit BoughtTicketEvent(_msgSender(), eventId);
    }

    /**
     *  @notice Create NFT Limit
     *
     *  @dev    All caller can call this function.
     */
    function createNFTLimit(
        bool isSellOnMarket,
        address nftAddress,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment
    ) external nonReentrant notZero(amount) notZero(price) whenNotPaused {
        ErrorHelper._checkUserCreateCollection(collectionFactory, nftAddress);
        ErrorHelper._checkValidNFTAddress(nftAddress);
        NFTHelper.Type typeNft = NFTHelper.getType(nftAddress);
        if (typeNft == NFTHelper.Type.ERC721) {
            _create721(isSellOnMarket, typeNft, nftAddress, amount, uri, price, startTime, endTime, payment);
        } else if (typeNft == NFTHelper.Type.ERC1155) {
            _create1155(isSellOnMarket, typeNft, nftAddress, amount, uri, price, startTime, endTime, payment);
        }
    }

    /**
     *  @notice create nft 721
     */
    function _create721(
        bool isSellOnMarket,
        NFTHelper.Type typeNft,
        address nftAddress,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment
    ) private notZeroAddress(nftAddress) {
        uint256 currentId;
        if (!isSellOnMarket) {
            ITokenERC721(nftAddress).mint(_msgSender(), uri);
            currentId = ITokenERC721(nftAddress).getTokenCounter();
        } else {
            ITokenERC721(nftAddress).mint(address(marketplace), uri);
            currentId = ITokenERC721(nftAddress).getTokenCounter();
            marketplace.extCreateMarketInfo(
                nftAddress,
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment
            );
        }

        emit Created(
            typeNft,
            nftAddress,
            currentId,
            _msgSender(),
            isSellOnMarket ? address(marketplace) : _msgSender(),
            amount
        );
    }

    /**
     *  @notice create nft 1155
     */
    function _create1155(
        bool isSellOnMarket,
        NFTHelper.Type typeNft,
        address nftAddress,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment
    ) private notZeroAddress(nftAddress) {
        uint256 currentId;
        if (!isSellOnMarket) {
            ITokenERC1155(nftAddress).mint(_msgSender(), amount, uri);
            currentId = ITokenERC1155(nftAddress).getTokenCounter();
        } else {
            ITokenERC1155(nftAddress).mint(address(marketplace), amount, uri);
            currentId = ITokenERC1155(nftAddress).getTokenCounter();
            marketplace.extCreateMarketInfo(
                nftAddress,
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment
            );
        }

        emit Created(
            typeNft,
            nftAddress,
            currentId,
            _msgSender(),
            isSellOnMarket ? address(marketplace) : _msgSender(),
            amount
        );
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165Upgradeable, IERC165Upgradeable) returns (bool) {
        return interfaceId == type(IMarketplaceManager).interfaceId || super.supportsInterface(interfaceId);
    }
}
