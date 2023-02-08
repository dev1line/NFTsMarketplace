// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "../interfaces/Collection/ITokenERC1155.sol";
import "../interfaces/Collection/ICollection.sol";
import "../Adminable.sol";
import "../lib/ErrorHelper.sol";

/**
 *  @title  Dev Non-fungible token
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the token ERC1155 for Operation.
 *          The contract here by is implemented to initial some NFT with royalties.
 */

contract TokenERC1155 is
    ITokenERC1155,
    ICollection,
    ReentrancyGuardUpgradeable,
    ERC1155Upgradeable,
    ERC2981Upgradeable,
    Adminable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    address public factory;
    string public name;
    string public symbol;
    uint256 public maxBatch;
    uint256 public maxTotalSupply;

    /**
     *  @notice _tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter private _tokenCounter;

    /**
     *  @notice uris mapping from token ID to token uri
     */
    mapping(uint256 => string) public uris;

    event Minted(uint256 indexed tokenId, address indexed to);
    event MintBatch(address indexed receiver, uint256[] tokenIds, uint256[] amounts, string[] uri);
    event SetMaxBatch(uint256 indexed oldMaxBatch, uint256 indexed newMaxBatch);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        string memory _name,
        string memory _symbol,
        uint256 _totalSuply,
        address _receiverRoyalty,
        uint96 _feeNumerator
    ) public initializer {
        __Adminable_init();

        transferOwnership(_owner);
        factory = _msgSender();
        name = _name;
        symbol = _symbol;
        maxBatch = 100;
        maxTotalSupply = _totalSuply;

        if (_receiverRoyalty != address(0)) {
            _setDefaultRoyalty(_receiverRoyalty, _feeNumerator);
        }
    }

    modifier onlyFactory() {
        if (_msgSender() != factory) {
            revert ErrorHelper.CallerIsNotFactory();
        }
        _;
    }

    /**
     *  @notice Set new uri for each token ID
     */
    function setURI(string memory newuri, uint256 tokenId) external onlyAdmin {
        uris[tokenId] = newuri;
    }

    /**
     *  @notice Mint NFT not pay token
     *
     *  @dev    Only owner or admin can call this function.
     */
    function mint(
        address _receiver,
        uint256 _amount,
        string memory _newuri
    ) external onlyAdmin notZeroAddress(_receiver) notZeroAmount(_amount) {
        _tokenCounter.increment();
        uint256 _tokenId = _tokenCounter.current();
        ErrorHelper._checkExceedTotalSupply(_tokenId, maxTotalSupply);
        uris[_tokenId] = _newuri;

        _mint(_receiver, _tokenId, _amount, "");

        emit Minted(_tokenId, _receiver);
    }

    function mintBatch(
        address _receiver,
        uint256[] memory _amounts,
        string[] memory _uri
    ) external onlyAdmin notZeroAddress(_receiver) {
        ErrorHelper._checkEachBatch(_amounts.length, maxBatch);
        if (_amounts.length != _uri.length) {
            revert ErrorHelper.InvalidArrayInput();
        }

        uint256 _tokenId = _tokenCounter.current();

        ErrorHelper._checkExceedTotalSupply(_tokenId + _amounts.length, maxTotalSupply);
        uint256[] memory _tokenIds = new uint256[](_amounts.length);
        for (uint256 i; i < _amounts.length; i++) {
            ErrorHelper._checkValidAmount(_amounts[i]);
            _tokenCounter.increment();
            _tokenId = _tokenCounter.current();
            uris[_tokenId] = _uri[i];
            _tokenIds[i] = _tokenId;

            _mint(_receiver, _tokenId, _amounts[i], "");
        }
        emit MintBatch(_receiver, _tokenIds, _amounts, _uri);
    }

    /**
     *  @notice Set maxBatch value to mint
     *  @param  _maxBatch that set maxBatch value
     */
    function setMaxBatch(uint256 _maxBatch) external onlyAdmin {
        ErrorHelper._checkMaxBatch(_maxBatch);
        uint256 oldMaxBatch = maxBatch;
        maxBatch = _maxBatch;
        emit SetMaxBatch(oldMaxBatch, _maxBatch);
    }

    /**
     *  @notice Replace the admin role by another address.
     *
     *  @dev    Only factory can call this function.
     */
    function setAdminByFactory(address _user, bool _allow) public override onlyFactory {
        _setAdmin(_user, _allow);
    }

    /**
     *  @notice Get token counter
     *
     *  @dev    All caller can call this function.
     */
    function getTokenCounter() external view returns (uint256) {
        return _tokenCounter.current();
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
    ) public view virtual override(ERC1155Upgradeable, ERC2981Upgradeable, IERC165Upgradeable) returns (bool) {
        return interfaceId == type(ITokenERC1155).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     *  @notice Return token URI.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return uris[tokenId];
    }
}
