// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 *  @title  Dev Fungible token
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the token ERC20 for Operation. These tokens initially are minted
 *          by the only controllers and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial.
 */
contract USD is ERC20Upgradeable, OwnableUpgradeable {
    /**
     *  @notice controllers mapping from token ID to isComtroller status
     */
    mapping(address => bool) public controllers;

    event SetController(address indexed user, bool allow);
    event Minted(address indexed receiver, uint256 amount);

    modifier onlyController() {
        require(controllers[_msgSender()], "Only controller can call");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _curator,
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _treasury
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __Ownable_init();

        transferOwnership(_curator);
        controllers[_curator] = true;

        _mint(_treasury, _totalSupply);
    }

    /**
     *  @notice Set or remove role controllers
     *
     *  @dev    Only owner can call this function.
     */
    function setController(address user, bool allow) external onlyOwner {
        require(user != address(0), "Invalid address");
        controllers[user] = allow;
        emit SetController(user, allow);
    }

    /**
     *  @notice Mint token
     *
     *  @dev    Only controllers can call this function.
     */
    function mint(address receiver, uint256 amount) external onlyController {
        require(receiver != address(0), "Invalid address");
        require(amount > 0, "Invalid amount");

        _mint(receiver, amount);

        emit Minted(receiver, amount);
    }

    /**
     *  @notice Burn token
     *
     *  @dev   All caller can call this function.
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        _burn(_msgSender(), amount);
    }
}
