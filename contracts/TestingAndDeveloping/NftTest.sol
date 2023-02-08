// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "../Validatable.sol";

/**
 *  @title  Dev Non-fungible token
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the token ERC721 for Operation. These tokens initially are minted
 *          by the all user and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial some NFT with royalties.
 */
contract NftTest is Validatable, ReentrancyGuardUpgradeable, ERC721EnumerableUpgradeable, ERC2981Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    /**
     *  @notice _tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter private _tokenCounter;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice price is price of each NFT sold
     */
    uint256 public price;

    /**
     *  @notice uris mapping from token ID to token uri
     */
    mapping(uint256 => string) public uris;

    event SetPrice(uint256 oldPrice, uint256 price);
    event Bought(uint256 indexed tokenId, address indexed to);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        IERC20Upgradeable _paymentToken,
        uint96 _feeNumerator,
        uint256 _price,
        IAdmin _admin
    ) public initializer {
        __Validatable_init(_admin);
        __ERC721_init(_name, _symbol);

        paymentToken = _paymentToken;
        price = _price;
        _setDefaultRoyalty(address(admin.treasury()), _feeNumerator);
    }

    /**
     *  @notice Set price of NFT
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setPrice(uint256 newPrice) external onlyAdmin notZero(newPrice) {
        uint256 oldPrice = price;
        price = newPrice;
        emit SetPrice(oldPrice, price);
    }

    /**
     *  @notice Buy NFT directly
     *
     *  @dev    All users can call this function.
     */
    function buy(string memory uri) external nonReentrant {
        _tokenCounter.increment();
        uint256 tokenId = _tokenCounter.current();

        uris[tokenId] = uri;
        _mint(_msgSender(), tokenId);
        paymentToken.safeTransferFrom(_msgSender(), address(admin.treasury()), price);

        emit Bought(tokenId, _msgSender());
    }

    /**
     *  @notice Set new uri for each token ID
     */
    function setTokenURI(string memory newURI, uint256 tokenId) external onlyAdmin {
        uris[tokenId] = newURI;
    }

    /**
     *  @notice Mapping token ID to base URI in ipfs storage
     *
     *  @dev    All caller can call this function.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        return uris[tokenId];
    }

    /**
     * @dev See {IERC165-supportsInterface} override for ERC2981Upgradeable, ERC721EnumerableUpgradeable
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721EnumerableUpgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
