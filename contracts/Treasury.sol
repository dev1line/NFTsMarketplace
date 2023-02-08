// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/ITreasury.sol";
import "./Validatable.sol";
import "./lib/TransferHelper.sol";

/**
 *  @title  Dev Treasury Contract
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the treasury for Operation. This contract initially store
 *          all assets and using for purchase in marketplace operation.
 */
contract Treasury is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, ITreasury {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    event Distributed(IERC20Upgradeable indexed paymentToken, address indexed destination, uint256 indexed amount);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ERC165_init();

        if (admin.treasury() == address(0)) {
            admin.registerTreasury();
        }
    }

    receive() external payable {}

    /**
     *  @notice Distribute reward depend on tokenomic.
     *
     *  @dev    Only owner or admin can call this function
     *
     *  @param  _paymentToken   Token address that is used for distribute
     *  @param  _to             Funding receiver
     *  @param  _amount         Amount of token
     */
    function distribute(
        IERC20Upgradeable _paymentToken,
        address _to,
        uint256 _amount
    ) external onlyAdmin validPaymentToken(_paymentToken) notZeroAddress(_to) notZero(_amount) nonReentrant {
        TransferHelper._transferToken(_paymentToken, _amount, address(this), _to);

        emit Distributed(_paymentToken, _to, _amount);
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
        return interfaceId == type(ITreasury).interfaceId || super.supportsInterface(interfaceId);
    }
}
